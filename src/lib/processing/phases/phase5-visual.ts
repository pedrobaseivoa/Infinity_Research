/**
 * Phase 5: Visual + Tables Extraction
 * Extracts data from figures and tables using vision models
 */

import { callOpenRouter, parseJSON } from '../openrouter'
import type { PipelineContext, Phase1Output, Phase5Output, PhaseResult } from '../types'

const PHASE5_PROMPT = `Analyze all visual elements (figures and tables) in this scientific paper.

CRITICAL INSTRUCTIONS:
1. Extract ACTUAL data values, not just descriptions.
2. Include exact numbers, p-values, Confidence Intervals (CIs), and percentages.
3. Return ONLY valid JSON. Do not include markdown or code blocks.
4. The output will be parsed programmatically. Follow the structure EXACTLY.

Structure:
{
  "figures": [
    {
      "id": "string - e.g. Figure 1",
      "page": "number",
      "caption": "string - exact caption",
      "type": "string - graph, diagram, photo, etc.",
      "content_description": "string - Detailed description of what the figure shows, COMBINED with all key data points, trends, and specific values visible in the image. Detailed, organized description. MUST combine all the visual trend with key data points"
    }
  ],
  "tables": [
    {
      "id": "string - e.g. Table 1",
      "page": "number",
      "caption": "string - exact caption",
      "content_summary": "string - Comprehensive textual summary of the table's data. MUST include specific numbers, percentages, p-values, and column headers found in the table rows. Comprehensive, structured summary of the table's content. Organize the data meaningfully. Ensure numeric values are explicitly tied to their column headers."
    }
  ],
  "visual_summary": "string - An overall summary of how the visual evidence supports the paper's main claims."
}

Return ONLY valid JSON.`

const VISION_MODELS = [
    'google/gemini-2.5-pro-preview',
    'openrouter/auto'
]

export async function runPhase5(
    ctx: PipelineContext,
    phase1: Phase1Output
): Promise<PhaseResult<Phase5Output>> {
    const startTime = Date.now()

    await ctx.updateArticle({
        phase5_status: 'running',
        current_phase: 5
    })

    try {
        // Skip if no visual elements
        if (!phase1.has_tables && !phase1.has_figures) {
            const skipOutput: Phase5Output = {
                figures: [],
                tables: [],
                visual_summary: '',
                skipped: true
            }

            await ctx.updateArticle({
                phase5_json: {
                    output: skipOutput,
                    model: null,
                    usage: { total_cost: 0, prompt_tokens: 0, completion_tokens: 0 },
                    duration_ms: 0,
                    timestamp: new Date().toISOString()
                },
                phase5_status: 'completed',
                phase5_duration_ms: 0,
                phase5_completed_at: new Date().toISOString()
            })

            return {
                output: skipOutput,
                duration_ms: 0,
                timestamp: new Date().toISOString()
            }
        }

        // Call vision models in parallel
        const results = await Promise.allSettled(
            VISION_MODELS.map(model =>
                callOpenRouter({
                    model,
                    prompt: PHASE5_PROMPT,
                    apiKey: ctx.apiKeys.openrouter_api_key,
                    pdfUrl: ctx.pdfUrl,
                    pdfEngine: 'cloudflare-ai'
                })
            )
        )

        const outputs: any[] = []
        let totalCost = 0
        let totalPromptTokens = 0
        let totalCompletionTokens = 0

        results.forEach((result, i) => {
            if (result.status === 'fulfilled') {
                outputs.push({
                    model: result.value.model,
                    extraction: parseJSON(result.value.content),
                    usage: result.value.usage
                })
                totalCost += result.value.usage.total_cost
                totalPromptTokens += result.value.usage.prompt_tokens
                totalCompletionTokens += result.value.usage.completion_tokens
            } else {
                outputs.push({
                    model: VISION_MODELS[i],
                    error: result.reason?.message
                })
            }
        })

        const duration_ms = Date.now() - startTime

        // Use first successful extraction as output
        const successfulExtraction = outputs.find(o => o.extraction && !o.error)
        const output: Phase5Output = successfulExtraction?.extraction || {
            figures: [],
            tables: [],
            visual_summary: ''
        }

        await ctx.updateArticle({
            phase5_json: {
                outputs,
                models_used: outputs.map(o => o.model),
                total_cost: totalCost,
                duration_ms,
                timestamp: new Date().toISOString()
            },
            phase5_status: 'completed',
            phase5_models: outputs.map(o => o.model),
            phase5_cost: totalCost,
            phase5_tokens: totalPromptTokens + totalCompletionTokens,
            phase5_duration_ms: duration_ms,
            phase5_prompt_tokens: totalPromptTokens,
            phase5_completion_tokens: totalCompletionTokens,
            phase5_completed_at: new Date().toISOString()
        })

        return {
            output,
            usage: {
                prompt_tokens: totalPromptTokens,
                completion_tokens: totalCompletionTokens,
                total_cost: totalCost
            },
            duration_ms,
            timestamp: new Date().toISOString()
        }
    } catch (error: any) {
        await ctx.updateArticle({
            phase5_status: 'failed',
            error_message: `Phase 5 failed: ${error.message}`
        })
        throw error
    }
}
