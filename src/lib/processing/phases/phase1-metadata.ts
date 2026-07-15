/**
 * Phase 1: Metadata Extraction
 * Extracts basic metadata from PDF using AI
 */

import { callOpenRouter, parseJSON } from '../openrouter'
import type { PipelineContext, Phase1Output, PhaseResult } from '../types'

const PHASE1_PROMPT = `Analyze this scientific/research paper and extract metadata.

Return this EXACT JSON structure with accurate data from the PDF:

{
  "title": "exact paper title",
  "authors": ["First Last", "First Last"],
  "doi": "10.xxxx/xxxxx or null",
  "abstract": "full abstract text",
  "journal": "journal/conference name or 'Preprint'",
  "year": 2024,
  "keywords": ["keyword1", "keyword2"],
  "study_type": "RCT|Cohort|Case-Control|Cross-Sectional|Meta-Analysis|Review|Case Study|Qualitative|Mixed Methods|Technical|Theoretical",
  "has_tables": true/false,
  "has_figures": true/false,
  "estimated_pages": 12
}

CRITICAL: Return ONLY valid JSON. No markdown, no explanation.`

export async function runPhase1(ctx: PipelineContext): Promise<PhaseResult<Phase1Output>> {
    const startTime = Date.now()

    // Update status to running
    await ctx.updateArticle({
        phase1_status: 'running',
        current_phase: 1
    })

    try {
        const result = await callOpenRouter({
            model: 'openai/chatgpt-4o-latest',
            prompt: PHASE1_PROMPT,
            apiKey: ctx.apiKeys.openrouter_api_key,
            pdfUrl: ctx.pdfUrl,
            pdfEngine: 'cloudflare-ai'
        })

        const output = parseJSON(result.content) as Phase1Output
        const duration_ms = Date.now() - startTime

        // Save to database
        await ctx.updateArticle({
            phase1_json: {
                output,
                model: result.model,
                usage: result.usage,
                duration_ms,
                timestamp: result.timestamp
            },
            phase1_status: 'completed',
            phase1_model: result.model,
            phase1_cost: result.usage.total_cost,
            phase1_tokens: result.usage.prompt_tokens + result.usage.completion_tokens,
            phase1_duration_ms: duration_ms,
            phase1_prompt_tokens: result.usage.prompt_tokens,
            phase1_completion_tokens: result.usage.completion_tokens,
            phase1_completed_at: result.timestamp
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
            phase1_status: 'failed',
            error_message: `Phase 1 failed: ${error.message}`
        })
        throw error
    }
}
