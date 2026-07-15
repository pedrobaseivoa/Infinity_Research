/**
 * Pipeline Orchestrator
 * Runs all 7 phases in sequence and handles the full processing flow
 */

import { runPhase1, runPhase2, runPhase3, runPhase4, runPhase5, runPhase6, runPhase7 } from './phases'
import type { PipelineContext, UserApiKeys, Phase7Output } from './types'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ProcessArticleOptions {
    articleId: string
    userId: string
    pdfUrl: string
    apiKeys: UserApiKeys
}

export interface ProcessingResult {
    success: boolean
    articleId: string
    output?: Phase7Output
    totalCost: number
    totalDuration: number
    totalTokens: number
    error?: string
}

/**
 * Process an article through all 7 phases
 */
export async function processArticle(options: ProcessArticleOptions): Promise<ProcessingResult> {
    const { articleId, userId, pdfUrl, apiKeys } = options
    const supabase = createAdminClient()

    // Helper to update article in database
    const updateArticle = async (updates: Record<string, any>) => {
        const { error } = await supabase
            .from('articles')
            .update(updates)
            .eq('id', articleId)

        if (error) {
            console.error('Failed to update article:', error)
        }
    }

    // Create pipeline context
    const ctx: PipelineContext = {
        articleId,
        userId,
        pdfUrl,
        apiKeys,
        updateArticle
    }

    let totalCost = 0
    let totalDuration = 0
    let totalTokens = 0

    try {
        // Mark as processing
        await updateArticle({
            status: 'processing',
            processing_started_at: new Date().toISOString()
        })

        console.log('Phase 1: Metadata Extraction...')
        const p1 = await runPhase1(ctx)
        totalCost += p1.usage?.total_cost || 0
        totalDuration += p1.duration_ms
        totalTokens += (p1.usage?.prompt_tokens || 0) + (p1.usage?.completion_tokens || 0)

        console.log('Phase 2: API Enrichment (11 APIs)...')
        const p2 = await runPhase2(ctx, p1.output)
        totalDuration += p2.duration_ms

        console.log('Phase 3: Metadata Consensus...')
        const p3 = await runPhase3(ctx, p1.output, p2.output)
        totalCost += p3.usage?.total_cost || 0
        totalDuration += p3.duration_ms
        totalTokens += (p3.usage?.prompt_tokens || 0) + (p3.usage?.completion_tokens || 0)

        console.log('Phase 4: Multi-Model Extraction...')
        const p4 = await runPhase4(ctx, p3.output)
        totalCost += p4.usage?.total_cost || 0
        totalDuration += p4.duration_ms
        totalTokens += (p4.usage?.prompt_tokens || 0) + (p4.usage?.completion_tokens || 0)

        console.log('Phase 5: Visual + Tables Extraction...')
        const p5 = await runPhase5(ctx, p1.output)
        totalCost += p5.usage?.total_cost || 0
        totalDuration += p5.duration_ms
        totalTokens += (p5.usage?.prompt_tokens || 0) + (p5.usage?.completion_tokens || 0)

        console.log('Phase 6: Scientific Consolidation...')
        const p6 = await runPhase6(ctx, p4.output, p5.output)
        totalCost += p6.usage?.total_cost || 0
        totalDuration += p6.duration_ms
        totalTokens += (p6.usage?.prompt_tokens || 0) + (p6.usage?.completion_tokens || 0)

        console.log('Phase 7: Final Merge (No LLM)...')
        const p7 = await runPhase7(ctx, p3.output, p6.output)
        totalDuration += p7.duration_ms

        // Update totals
        await updateArticle({
            total_cost: totalCost,
            total_tokens: totalTokens,
            total_duration_ms: totalDuration
        })

        console.log(`✅ Complete! Total: $${totalCost.toFixed(4)} in ${(totalDuration / 1000).toFixed(1)}s`)

        return {
            success: true,
            articleId,
            output: p7.output,
            totalCost,
            totalDuration,
            totalTokens
        }
    } catch (error: any) {
        console.error('Processing error:', error)

        await updateArticle({
            status: 'failed',
            error_message: error.message,
            processing_completed_at: new Date().toISOString()
        })

        return {
            success: false,
            articleId,
            totalCost,
            totalDuration,
            totalTokens,
            error: error.message
        }
    }
}

/**
 * Get user's API keys from database
 */
export async function getUserApiKeys(userId: string): Promise<UserApiKeys | null> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('user_settings')
        .select('openrouter_api_key, semantic_scholar_api_key, openalex_api_key, core_api_key')
        .eq('user_id', userId)
        .single()

    if (error || !data?.openrouter_api_key) {
        return null
    }

    return {
        openrouter_api_key: data.openrouter_api_key,
        semantic_scholar_api_key: data.semantic_scholar_api_key,
        openalex_api_key: data.openalex_api_key,
        core_api_key: data.core_api_key
    }
}
