// Supabase Edge Function: process-phase5
// Visual + Tables Extraction using Vision Models

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============ OpenRouter Client (inline, with cloudflare-ai → mistral-ocr fallback) ============
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize)
        binary += String.fromCharCode.apply(null, Array.from(chunk))
    }
    return btoa(binary)
}

function isPdfParseError(msg: string): boolean {
    const lower = msg.toLowerCase()
    return lower.includes('failed to parse document') || lower.includes('file-parser') || lower.includes('invalid input')
}

async function sendRequest(model: string, content: any[], apiKey: string, engine: string | undefined, hasPdf: boolean, maxTokens: number): Promise<any> {
    const body: any = { model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }
    if (hasPdf && engine) body.plugins = [{ id: 'file-parser', pdf: { engine } }]

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://infinity-research.app',
            'X-Title': 'Infinity Research'
        },
        body: JSON.stringify(body)
    })

    if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`OpenRouter HTTP ${response.status}: ${errorBody}`)
    }

    const data = await response.json()
    if (data.error) throw new Error(data.error.message || 'OpenRouter API error')
    return data
}

async function callOpenRouter(options: {
    model: string
    prompt: string
    apiKey: string
    pdfUrl?: string
    pdfEngine?: string
    maxTokens?: number
}) {
    const { model, prompt, apiKey, pdfUrl, pdfEngine = 'cloudflare-ai', maxTokens = 16000 } = options
    const content: any[] = [{ type: 'text', text: prompt }]

    if (pdfUrl) {
        const pdfResponse = await fetch(pdfUrl)
        const pdfBuffer = await pdfResponse.arrayBuffer()
        const base64 = arrayBufferToBase64(pdfBuffer)
        content.push({
            type: 'file',
            file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${base64}` }
        })
    }

    const hasPdf = !!pdfUrl
    let data: any

    if (hasPdf && pdfEngine === 'cloudflare-ai') {
        try {
            data = await sendRequest(model, content, apiKey, 'cloudflare-ai', true, maxTokens)
        } catch (err: any) {
            if (isPdfParseError(err.message)) {
                console.log(`PDF cloudflare-ai parsing failed, falling back to mistral-ocr for ${model}`)
                data = await sendRequest(model, content, apiKey, 'mistral-ocr', true, maxTokens)
            } else {
                throw err
            }
        }
    } else {
        data = await sendRequest(model, content, apiKey, pdfEngine, hasPdf, maxTokens)
    }

    let totalCost = 0
    let nativePromptTokens = data.usage?.prompt_tokens || 0
    let nativeCompletionTokens = data.usage?.completion_tokens || 0

    if (data.id) {
        try {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const genRes = await fetch(`https://openrouter.ai/api/v1/generation?id=${data.id}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            })
            const genData = await genRes.json()
            if (genData.data) {
                totalCost = genData.data.total_cost || 0
                nativePromptTokens = genData.data.native_tokens_prompt || nativePromptTokens
                nativeCompletionTokens = genData.data.native_tokens_completion || nativeCompletionTokens
            }
        } catch (e) { console.log('Generation API fetch failed:', e) }
    }

    return {
        content: data.choices?.[0]?.message?.content || '',
        model: data.model || model,
        usage: { prompt_tokens: nativePromptTokens, completion_tokens: nativeCompletionTokens, total_cost: totalCost },
        timestamp: new Date().toISOString()
    }
}

function parseJSON(content: string): any {
    try {
        let cleaned = content
        if (content.includes('```')) {
            const match = content.match(/```(?:json)?\s*([\s\S]*?)```/)
            if (match) cleaned = match[1].trim()
        }
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
        if (jsonMatch) return JSON.parse(jsonMatch[0])
        return JSON.parse(cleaned)
    } catch (_e) {
        return { error: 'Failed to parse JSON', raw: content.substring(0, 500) }
    }
}

// ============ Phase 5 Logic ============
const PHASE5_PROMPT = `Analyze all visual elements (figures and tables) in this scientific paper.

CRITICAL INSTRUCTIONS:
1. Extract ACTUAL data values, not just descriptions.
2. Include exact numbers, p-values, Confidence Intervals (CIs), and percentages.
3. Return ONLY valid JSON. Do not include markdown or code blocks.

Structure:
{
  "figures": [
    {
      "id": "string - e.g. Figure 1",
      "page": "number",
      "caption": "string - exact caption",
      "type": "string - graph, diagram, photo, etc.",
      "content_description": "string - Detailed description with key data points"
    }
  ],
  "tables": [
    {
      "id": "string - e.g. Table 1",
      "page": "number",
      "caption": "string - exact caption",
      "content_summary": "string - Include specific numbers, percentages, p-values"
    }
  ],
  "visual_summary": "string - Overall summary of visual evidence"
}

Return ONLY valid JSON.`

const VISION_MODELS = ['google/gemini-2.5-pro-preview', 'openrouter/auto']

Deno.serve(async (req) => {
    const startTime = Date.now()

    try {
        const { articleId } = await req.json()
        if (!articleId) return new Response(JSON.stringify({ error: 'Missing articleId' }), { status: 400 })

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

        const { data: article, error: fetchError } = await supabase.from('articles').select('*').eq('id', articleId).single()
        if (fetchError || !article) return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 })

        const { data: settings } = await supabase.from('user_settings').select('openrouter_api_key').eq('user_id', article.user_id).single()
        if (!settings?.openrouter_api_key) {
            await supabase.from('articles').update({ phase5_status: 'failed', error_message: 'OpenRouter API key not configured' }).eq('id', articleId)
            return new Response(JSON.stringify({ error: 'No API key' }), { status: 400 })
        }

        await supabase.from('articles').update({ phase5_status: 'running', current_phase: 5 }).eq('id', articleId)

        // Check if has visual elements
        const phase1 = article.phase1_json?.output
        if (!phase1?.has_tables && !phase1?.has_figures) {
            const skipOutput = { figures: [], tables: [], visual_summary: '', skipped: true }
            await supabase.from('articles').update({
                phase5_json: { output: skipOutput, model: null, usage: { total_cost: 0, prompt_tokens: 0, completion_tokens: 0 }, duration_ms: 0, timestamp: new Date().toISOString() },
                phase5_status: 'completed',
                phase5_duration_ms: 0,
                phase5_completed_at: new Date().toISOString()
            }).eq('id', articleId)
            return new Response(JSON.stringify({ success: true, skipped: true }))
        }

        const results = await Promise.allSettled(
            VISION_MODELS.map(model => callOpenRouter({ model, prompt: PHASE5_PROMPT, apiKey: settings.openrouter_api_key, pdfUrl: article.pdf_url, pdfEngine: 'cloudflare-ai' }))
        )

        const outputs: any[] = []
        let totalCost = 0, totalPromptTokens = 0, totalCompletionTokens = 0

        results.forEach((result, i) => {
            if (result.status === 'fulfilled') {
                outputs.push({ model: result.value.model, extraction: parseJSON(result.value.content), usage: result.value.usage })
                totalCost += result.value.usage.total_cost
                totalPromptTokens += result.value.usage.prompt_tokens
                totalCompletionTokens += result.value.usage.completion_tokens
            } else {
                outputs.push({ model: VISION_MODELS[i], error: result.reason?.message })
            }
        })

        const duration_ms = Date.now() - startTime
        const successfulExtraction = outputs.find(o => o.extraction && !o.error)
        const output = successfulExtraction?.extraction || { figures: [], tables: [], visual_summary: '' }

        await supabase.from('articles').update({
            phase5_json: { outputs, models_used: outputs.map(o => o.model), total_cost: totalCost, duration_ms, timestamp: new Date().toISOString() },
            phase5_status: 'completed',
            phase5_models: outputs.map(o => o.model),
            phase5_cost: totalCost,
            phase5_tokens: totalPromptTokens + totalCompletionTokens,
            phase5_duration_ms: duration_ms,
            phase5_prompt_tokens: totalPromptTokens,
            phase5_completion_tokens: totalCompletionTokens,
            phase5_completed_at: new Date().toISOString()
        }).eq('id', articleId)

        console.log(`[Phase 5] Article ${articleId} completed in ${duration_ms}ms, cost: $${totalCost.toFixed(4)}`)
        return new Response(JSON.stringify({ success: true, articleId, duration_ms, cost: totalCost }), { headers: { 'Content-Type': 'application/json' } })

    } catch (error: any) {
        console.error('[Phase 5] Error:', error)
        try {
            const { articleId } = await req.clone().json()
            if (articleId) {
                const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
                await supabase.from('articles').update({ phase5_status: 'failed', error_message: `Phase 5 failed: ${error.message}` }).eq('id', articleId)
            }
        } catch (_e) { }
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
})
