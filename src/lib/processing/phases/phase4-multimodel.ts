/**
 * Phase 4: Multi-Model Scientific Extraction
 * Uses 4 AI models in parallel to extract detailed scientific data
 */

import { callOpenRouter, parseJSON } from '../openrouter'
import type { PipelineContext, Phase3Output, Phase4Output, PhaseResult } from '../types'

const getPhase4Prompt = (title: string) => `Analyze the FULL content of this paper titled "${title || 'Unknown'}" to extract specific scientific/technical data.

CRITICAL INSTRUCTIONS:
1. You MUST read the entire text, not just the abstract.
2. Return ONLY valid JSON. Do not include markdown formatting, code blocks, or explanations.
3. The output will be parsed programmatically. Follow the structure EXACTLY.

Structure:
{
  "methodology": "string - Detailed study design, architecture, or theoretical framework used (e.g. 'Randomized Trial', 'Transformer Architecture', 'Qualitative Case Study').",

  "sample_size": "string - Sample size, dataset size, or scope of analysis (e.g. 'N=1200 patients', '3.5M image dataset', '5 key stakeholders').",

  "population": "string - Description of the population, dataset, or subjects studied (e.g. 'Patients with diabetes', 'Twitter API data from 2023', 'Civil Engineering students').",

  "intervention": "string - The core intervention, new model, prototype, or phenomenon being tested/observed (e.g. 'New Drug X', 'Modified Attention Mechanism', 'Remote Work Policy').",

  "control": "string - Comparison group, baseline model, or standard of care (e.g. 'Placebo', 'ResNet-50 Baseline', 'Pre-pandemic data').",

  "primary_outcomes": "string - Main results or performance metrics. Include specific numbers/stats (e.g. 'Accuracy: 98.5% (SOTA)', 'Hazard Ratio: 0.85 (p=0.03)', 'Themes identified: A, B, C').",

  "secondary_outcomes": "string - Additional findings, ablation studies, or secondary analyses.",

  "main_results": "string - Synthesis of typical results. What worked? What didn't? Focus on the difference between proposed approach vs baseline.",

  "limitations": "string - Limitations acknowledged (e.g. 'Small dataset', 'High computational cost', 'Recall bias').",

  "conclusions": "string - Final conclusions and implications for the field.",

  "ethical_considerations": "string - Ethics approval, data privacy, bias considerations, environmental impact, or conflict of interest."
}

Return ONLY valid JSON.`

const MODELS = [
    'google/gemini-2.5-pro-preview',
    'anthropic/claude-sonnet-4',
    'openai/gpt-4.1-mini',
    'x-ai/grok-3-mini-beta'
]

export async function runPhase4(
    ctx: PipelineContext,
    phase3: Phase3Output
): Promise<PhaseResult<Phase4Output>> {
    const startTime = Date.now()

    await ctx.updateArticle({
        phase4_status: 'running',
        current_phase: 4
    })

    try {
        const prompt = getPhase4Prompt(phase3.title)

        // Call all 4 models in parallel
        const results = await Promise.allSettled(
            MODELS.map(model =>
                callOpenRouter({
                    model,
                    prompt,
                    apiKey: ctx.apiKeys.openrouter_api_key,
                    pdfUrl: ctx.pdfUrl,
                    pdfEngine: 'cloudflare-ai'
                })
            )
        )

        const extractions: Phase4Output['extractions'] = []
        let totalCost = 0
        let totalPromptTokens = 0
        let totalCompletionTokens = 0

        results.forEach((result, i) => {
            if (result.status === 'fulfilled') {
                extractions.push({
                    model: result.value.model,
                    extraction: parseJSON(result.value.content),
                    usage: result.value.usage
                })
                totalCost += result.value.usage.total_cost
                totalPromptTokens += result.value.usage.prompt_tokens
                totalCompletionTokens += result.value.usage.completion_tokens
            } else {
                extractions.push({
                    model: MODELS[i],
                    extraction: {} as any,
                    error: result.reason?.message
                })
            }
        })

        const duration_ms = Date.now() - startTime
        const output: Phase4Output = { extractions }

        await ctx.updateArticle({
            phase4_json: {
                output,
                models_used: extractions.map(e => e.model),
                total_cost: totalCost,
                duration_ms,
                timestamp: new Date().toISOString()
            },
            phase4_status: 'completed',
            phase4_models: extractions.map(e => e.model),
            phase4_cost: totalCost,
            phase4_tokens: totalPromptTokens + totalCompletionTokens,
            phase4_duration_ms: duration_ms,
            phase4_prompt_tokens: totalPromptTokens,
            phase4_completion_tokens: totalCompletionTokens,
            phase4_completed_at: new Date().toISOString()
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
            phase4_status: 'failed',
            error_message: `Phase 4 failed: ${error.message}`
        })
        throw error
    }
}
