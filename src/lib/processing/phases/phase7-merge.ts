/**
 * Phase 7: Final Merge (No LLM - Code Only)
 * Merges Phase 3 (metadata) + Phase 6 (scientific) into final output
 */

import type { PipelineContext, Phase3Output, Phase6Output, Phase7Output, PhaseResult } from '../types'

export async function runPhase7(
    ctx: PipelineContext,
    phase3: Phase3Output,
    phase6: Phase6Output,
    article?: any // Pass article to get phase durations
): Promise<PhaseResult<Phase7Output>> {
    const startTime = Date.now()

    await ctx.updateArticle({
        phase7_status: 'running',
        current_phase: 7
    })

    try {
        // Literal merge of phase3 and phase6 JSONs - no LLM
        const output: Phase7Output = {
            phase3_consensus: phase3,
            phase6_scientific: phase6,
            _processing: {
                pipeline_version: '4.0',
                phases_completed: 7,
                merged_at: new Date().toISOString()
            }
        }

        const duration_ms = Date.now() - startTime

        // Calculate totals from all phases
        const totalDuration = (article?.phase1_duration_ms || 0) +
            (article?.phase2_duration_ms || 0) +
            (article?.phase3_duration_ms || 0) +
            (article?.phase4_duration_ms || 0) +
            (article?.phase5_duration_ms || 0) +
            (article?.phase6_duration_ms || 0) +
            duration_ms

        const totalCost = (article?.phase1_cost || 0) +
            (article?.phase2_cost || 0) +
            (article?.phase3_cost || 0) +
            (article?.phase4_cost || 0) +
            (article?.phase5_cost || 0) +
            (article?.phase6_cost || 0)

        const totalTokens = (article?.phase1_tokens || 0) +
            (article?.phase2_tokens || 0) +
            (article?.phase3_tokens || 0) +
            (article?.phase4_tokens || 0) +
            (article?.phase5_tokens || 0) +
            (article?.phase6_tokens || 0)

        await ctx.updateArticle({
            phase7_json: {
                output,
                model: null,
                usage: { total_cost: 0, prompt_tokens: 0, completion_tokens: 0 },
                timestamp: new Date().toISOString()
            },
            phase7_status: 'completed',
            phase7_duration_ms: duration_ms,
            phase7_completed_at: new Date().toISOString(),
            status: 'completed',
            processing_completed_at: new Date().toISOString(),
            total_duration_ms: totalDuration,
            total_cost: totalCost,
            total_tokens: totalTokens
        })

        return {
            output,
            duration_ms,
            timestamp: new Date().toISOString()
        }
    } catch (error: any) {
        await ctx.updateArticle({
            phase7_status: 'failed',
            error_message: `Phase 7 failed: ${error.message}`
        })
        throw error
    }
}
