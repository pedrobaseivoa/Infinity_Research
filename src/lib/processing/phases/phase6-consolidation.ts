/**
 * Phase 6: Scientific Consolidation
 * Consolidates Phase 4 + Phase 5 into a single coherent record
 */

import { callOpenRouter, parseJSON } from '../openrouter'
import type { PipelineContext, Phase4Output, Phase5Output, Phase6Output, PhaseResult } from '../types'

const getPhase6Prompt = (phase4: Phase4Output, phase5: Phase5Output) => {
    const extractions = phase4.extractions?.filter(e => !e.error) || []

    return `You are a Principal Investigator consolidating data from multiple AI analysts.

INPUTS:
1. TEXT EXTRACTIONS (from ${extractions.length} models):
${extractions.map((e, i) => `Model ${i + 1} (${e.model}):\n${JSON.stringify(e.extraction, null, 2)}`).join('\n\n')}

2. VISUAL DATA (Figures & Tables):
${JSON.stringify(phase5, null, 2)}

TASK:
Create a SINGLE, CONSISTENT Scientific Record by merging these inputs.
Resolve discrepancies using this logic:
1. If text models disagree on numbers (e.g. sample size), TRUST THE TABLE/FIGURE DATA.
2. If text models disagree on qualitative claims, use the majority consensus.
3. Ensure all fields are filled with the most precise available info.

CRITICAL: Return JSON with the EXACT SAME keys as the input text models, plus a 'consolidation_notes' field.

Structure:
{
  "methodology": "string",
  "sample_size": "string",
  "population": "string",
  "intervention": "string",
  "control": "string",
  "primary_outcomes": "string",
  "secondary_outcomes": "string",
  "main_results": "string",
  "limitations": "string",
  "conclusions": "string",
  "ethical_considerations": "string",
  "consolidation_notes": "string - Briefly explain any major conflicts resolved (e.g. 'Corrected sample size based on Table 1')"
}

Return ONLY valid JSON.`
}

export async function runPhase6(
    ctx: PipelineContext,
    phase4: Phase4Output,
    phase5: Phase5Output
): Promise<PhaseResult<Phase6Output>> {
    const startTime = Date.now()

    await ctx.updateArticle({
        phase6_status: 'running',
        current_phase: 6
    })

    try {
        const extractions = phase4.extractions?.filter(e => !e.error) || []

        // If no valid extractions, just use visual data
        if (extractions.length === 0) {
            const fallbackOutput: Phase6Output = {
                consolidated: {
                    methodology: '',
                    sample_size: '',
                    population: '',
                    intervention: '',
                    control: '',
                    primary_outcomes: '',
                    secondary_outcomes: '',
                    main_results: '',
                    limitations: '',
                    conclusions: '',
                    ethical_considerations: '',
                    consolidation_notes: 'No text extractions available'
                },
                source_count: 0
            }

            await ctx.updateArticle({
                phase6_json: {
                    output: fallbackOutput,
                    model: null,
                    duration_ms: 0,
                    timestamp: new Date().toISOString()
                },
                phase6_status: 'completed',
                phase6_duration_ms: 0,
                phase6_completed_at: new Date().toISOString()
            })

            return {
                output: fallbackOutput,
                duration_ms: 0,
                timestamp: new Date().toISOString()
            }
        }

        const result = await callOpenRouter({
            model: 'deepseek/deepseek-chat-v3-0324',
            prompt: getPhase6Prompt(phase4, phase5),
            apiKey: ctx.apiKeys.openrouter_api_key
        })

        const consolidated = parseJSON(result.content)
        const duration_ms = Date.now() - startTime

        const output: Phase6Output = {
            consolidated,
            source_count: extractions.length
        }

        await ctx.updateArticle({
            phase6_json: {
                output,
                model: result.model,
                usage: result.usage,
                duration_ms,
                timestamp: result.timestamp
            },
            phase6_status: 'completed',
            phase6_model: result.model,
            phase6_cost: result.usage.total_cost,
            phase6_tokens: result.usage.prompt_tokens + result.usage.completion_tokens,
            phase6_duration_ms: duration_ms,
            phase6_prompt_tokens: result.usage.prompt_tokens,
            phase6_completion_tokens: result.usage.completion_tokens,
            phase6_completed_at: result.timestamp
        })

        return {
            output,
            model: result.model,
            usage: result.usage,
            duration_ms,
            timestamp: result.timestamp
        }
    } catch (error: any) {
        await ctx.updateArticle({
            phase6_status: 'failed',
            error_message: `Phase 6 failed: ${error.message}`
        })
        throw error
    }
}
