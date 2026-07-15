import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserApiKeys } from '@/lib/processing'
import { runPhase1 } from '@/lib/processing/phases/phase1-metadata'
import { runPhase2 } from '@/lib/processing/phases/phase2-enrichment'
import { runPhase3 } from '@/lib/processing/phases/phase3-consensus'
import { runPhase7 } from '@/lib/processing/phases/phase7-merge'
import type { PipelineContext, UserApiKeys } from '@/lib/processing/types'

// Heavy phases (4, 5, 6) are delegated to Supabase Edge Functions
// which have 150s timeout instead of Vercel's 60s limit
// const EDGE_FUNCTION_PHASES = [4, 5, 6]

/**
 * Event-driven Phase Runner
 *
 * CRITICAL: This includes guards against webhook loops
 * The webhook fires on every UPDATE, so we:
 * 1. Only run if next phase status is 'pending' (not 'running' or 'completed')
 * 2. Check if there's actually a phase to run
 */
export async function POST(request: Request) {
    const supabase = createAdminClient()

    try {
        const payload = await request.json()

        // Handle both INSERT and UPDATE events
        const record = payload.record || payload
        const oldRecord = payload.old_record

        // Get article ID from the payload
        const articleId = record.id

        if (!articleId) {
            return NextResponse.json({ error: 'No article ID' }, { status: 400 })
        }

        // GUARD: If this is an UPDATE, check if a phase status actually changed to 'completed'
        // This prevents loops from non-phase updates
        if (oldRecord && payload.type === 'UPDATE') {
            const phaseCompleted = checkIfPhaseJustCompleted(oldRecord, record)
            if (!phaseCompleted) {
                return NextResponse.json({
                    message: 'No phase transition detected, skipping',
                    reason: 'This UPDATE did not complete a phase'
                })
            }
        }

        // Fetch fresh article data
        const { data: article, error: fetchError } = await supabase
            .from('articles')
            .select('*')
            .eq('id', articleId)
            .single()

        if (fetchError || !article) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 })
        }

        // GUARD: If already completed or failed, skip
        if (article.status === 'completed' || article.status === 'failed') {
            return NextResponse.json({ message: 'Article already finished', status: article.status })
        }

        // Determine which phase to run next
        const nextPhase = determineNextPhase(article)

        if (!nextPhase) {
            // Mark as completed if all phases done
            await supabase
                .from('articles')
                .update({
                    status: 'completed',
                    processing_completed_at: new Date().toISOString()
                })
                .eq('id', articleId)
            return NextResponse.json({ message: 'All phases completed' })
        }

        // GUARD: Check if next phase is already running (prevents duplicate execution)
        const phaseStatus = article[`phase${nextPhase}_status`]
        if (phaseStatus === 'running') {
            return NextResponse.json({
                message: `Phase ${nextPhase} already running, skipping`,
                phase: nextPhase
            })
        }

        // Get user's API keys
        const apiKeys = await getUserApiKeys(article.user_id)

        if (!apiKeys?.openrouter_api_key) {
            await supabase
                .from('articles')
                .update({
                    status: 'failed',
                    error_message: 'OpenRouter API key not configured'
                })
                .eq('id', articleId)

            return NextResponse.json({ error: 'No API key' }, { status: 400 })
        }

        console.log(`[Phase Runner] Article ${articleId} - Running Phase ${nextPhase}`)

        // Create the pipeline context
        const ctx: PipelineContext = {
            articleId,
            userId: article.user_id,
            pdfUrl: article.pdf_url,
            apiKeys: apiKeys as UserApiKeys,
            updateArticle: async (updates: Record<string, any>) => {
                await supabase
                    .from('articles')
                    .update(updates)
                    .eq('id', articleId)
            }
        }

        // Run the phase
        const result = await runPhase(nextPhase, ctx, article, supabase)

        // Check if this was the last phase
        if (nextPhase === 7) {
            await ctx.updateArticle({
                status: 'completed',
                processing_completed_at: new Date().toISOString()
            })
        }

        console.log(`[Phase Runner] Article ${articleId} - Phase ${nextPhase} completed`)

        return NextResponse.json({
            success: true,
            phase: nextPhase,
            articleId,
            status: nextPhase === 7 ? 'completed' : 'next_phase_pending'
        })

    } catch (error: any) {
        console.error('[Phase Runner] Error:', error)

        // Try to mark article as failed
        try {
            const payload = await request.clone().json()
            const articleId = payload.record?.id || payload.id
            if (articleId) {
                await supabase
                    .from('articles')
                    .update({
                        status: 'failed',
                        error_message: error.message
                    })
                    .eq('id', articleId)
            }
        } catch (e) { }

        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/**
 * Check if a phase status just changed from 'running' to 'completed'
 */
function checkIfPhaseJustCompleted(oldRecord: any, newRecord: any): boolean {
    const phases = [1, 2, 3, 4, 5, 6, 7]

    for (const phase of phases) {
        const oldStatus = oldRecord[`phase${phase}_status`]
        const newStatus = newRecord[`phase${phase}_status`]

        // Phase just completed
        if (oldStatus === 'running' && newStatus === 'completed') {
            return true
        }
    }

    // Also trigger on INSERT (no old record status)
    if (!oldRecord.phase1_status && newRecord.phase1_status === 'pending') {
        return true
    }

    return false
}

/**
 * Determine which phase to run next based on article state
 * Only returns phases that are 'pending'
 */
function determineNextPhase(article: any): number | null {
    if (article.phase1_status === 'pending') return 1
    if (article.phase1_status === 'completed' && article.phase2_status === 'pending') return 2
    if (article.phase2_status === 'completed' && article.phase3_status === 'pending') return 3
    if (article.phase3_status === 'completed' && article.phase4_status === 'pending') return 4
    if (article.phase4_status === 'completed' && article.phase5_status === 'pending') return 5
    if (article.phase5_status === 'completed' && article.phase6_status === 'pending') return 6
    if (article.phase6_status === 'completed' && article.phase7_status === 'pending') return 7
    return null
}

/**
 * Run a specific phase with the pipeline context
 * Phases 1, 2, 3, 7 run locally (fast)
 * Phases 4, 5, 6 are delegated to Supabase Edge Functions (150s timeout)
 */
// Heavy phases (4, 5, 6) are delegated to Supabase Edge Functions
// which have 150s timeout instead of Vercel's 60s limit
const EDGE_FUNCTION_PHASES = [4, 5, 6]

/**
 * Run a specific phase with the pipeline context
 * Phases 1, 2, 3, 7 run locally (fast)
 * Phases 4, 5, 6 are delegated to Supabase Edge Functions (150s timeout)
 */
async function runPhase(phase: number, ctx: PipelineContext, article: any, supabase: any) {
    // Heavy phases - delegate to Edge Functions
    if (EDGE_FUNCTION_PHASES.includes(phase)) {
        console.log(`[Phase Runner] Delegating Phase ${phase} to Edge Function`)

        const { error } = await supabase.functions.invoke(`process-phase${phase}`, {
            body: { articleId: ctx.articleId }
        })

        if (error) {
            throw new Error(`Edge Function error: ${error.message}`)
        }

        // Edge function updates the DB directly, we just return
        return { delegated: true, phase }
    }

    // Light phases - run locally
    console.log(`[Phase Runner] Executing Phase ${phase} locally`)

    switch (phase) {
        case 1:
            return await runPhase1(ctx)

        case 2:
            const phase1Output = article.phase1_json?.output
            if (!phase1Output) throw new Error('Phase 1 output not found')
            return await runPhase2(ctx, phase1Output)

        case 3:
            const p1 = article.phase1_json?.output
            const p2 = article.phase2_json?.output
            if (!p1 || !p2) throw new Error('Phase 1 or 2 output not found')
            return await runPhase3(ctx, p1, p2)

        case 7:
            const p3 = article.phase3_json?.output
            const p6 = article.phase6_json?.output
            if (!p3 || !p6) throw new Error('Phase 3 or 6 output not found')
            return await runPhase7(ctx, p3, p6, article)

        default:
            throw new Error(`Unknown phase: ${phase}`)
    }
}

// Health check
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        endpoint: 'process/phase-runner',
        description: 'Event-driven phase processor with loop protection'
    })
}
