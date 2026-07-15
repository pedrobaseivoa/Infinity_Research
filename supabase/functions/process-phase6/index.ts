// Supabase Edge Function: process-phase6
// Scientific Consolidation - Merges Phase 4 + Phase 5 outputs

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

// ============ Phase 6 Logic ============
const getPhase6Prompt = (extractions: any[], phase5: any) => `You are a Principal Investigator consolidating data from multiple AI analysts.

INPUTS:
1. TEXT EXTRACTIONS (from ${extractions.length} models):
${extractions.map((e: any, i: number) => `Model ${i + 1} (${e.model}):\n${JSON.stringify(e.extraction, null, 2)}`).join('\n\n')}

2. VISUAL DATA (Figures & Tables):
${JSON.stringify(phase5, null, 2)}

TASK:
Create a SINGLE, CONSISTENT Scientific Record by merging these inputs.
Resolve discrepancies:
1. If models disagree on numbers, TRUST TABLE/FIGURE DATA.
2. If models disagree on qualitative claims, use majority consensus.

Return JSON with these exact keys:
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
  "consolidation_notes": "string - Explain any major conflicts resolved"
}

Return ONLY valid JSON.`

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
            await supabase.from('articles').update({ phase6_status: 'failed', error_message: 'OpenRouter API key not configured' }).eq('id', articleId)
            return new Response(JSON.stringify({ error: 'No API key' }), { status: 400 })
        }

        await supabase.from('articles').update({ phase6_status: 'running', current_phase: 6 }).eq('id', articleId)

        const phase4 = article.phase4_json?.output
        const phase5 = article.phase5_json?.output || article.phase5_json?.outputs?.[0]?.extraction
        const extractions = phase4?.extractions?.filter((e: any) => !e.error) || []

        // If no valid extractions, create empty output
        if (extractions.length === 0) {
            const fallbackOutput = {
                consolidated: {
                    methodology: '', sample_size: '', population: '', intervention: '', control: '',
                    primary_outcomes: '', secondary_outcomes: '', main_results: '', limitations: '',
                    conclusions: '', ethical_considerations: '', consolidation_notes: 'No text extractions available'
                },
                source_count: 0
            }
            await supabase.from('articles').update({
                phase6_json: { output: fallbackOutput, model: null, duration_ms: 0, timestamp: new Date().toISOString() },
                phase6_status: 'completed',
                phase6_duration_ms: 0,
                phase6_completed_at: new Date().toISOString()
            }).eq('id', articleId)
            return new Response(JSON.stringify({ success: true, skipped: true }))
        }

        const result = await callOpenRouter({
            model: 'deepseek/deepseek-chat-v3-0324',
            prompt: getPhase6Prompt(extractions, phase5),
            apiKey: settings.openrouter_api_key
        })

        const consolidated = parseJSON(result.content)
        const duration_ms = Date.now() - startTime
        const output = { consolidated, source_count: extractions.length }

        await supabase.from('articles').update({
            phase6_json: { output, model: result.model, usage: result.usage, duration_ms, timestamp: result.timestamp },
            phase6_status: 'completed',
            phase6_model: result.model,
            phase6_cost: result.usage.total_cost,
            phase6_tokens: result.usage.prompt_tokens + result.usage.completion_tokens,
            phase6_duration_ms: duration_ms,
            phase6_prompt_tokens: result.usage.prompt_tokens,
            phase6_completion_tokens: result.usage.completion_tokens,
            phase6_completed_at: result.timestamp
        }).eq('id', articleId)

        console.log(`[Phase 6] Article ${articleId} completed in ${duration_ms}ms, cost: $${result.usage.total_cost.toFixed(4)}`)
        return new Response(JSON.stringify({ success: true, articleId, duration_ms, cost: result.usage.total_cost }), { headers: { 'Content-Type': 'application/json' } })

    } catch (error: any) {
        console.error('[Phase 6] Error:', error)
        try {
            const { articleId } = await req.clone().json()
            if (articleId) {
                const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
                await supabase.from('articles').update({ phase6_status: 'failed', error_message: `Phase 6 failed: ${error.message}` }).eq('id', articleId)
            }
        } catch (_e) { }
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
})
