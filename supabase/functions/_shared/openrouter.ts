/**
 * OpenRouter API Client for Supabase Edge Functions (Deno)
 */

export interface OpenRouterResponse {
    content: string
    model: string
    generation_id: string
    usage: {
        prompt_tokens: number
        completion_tokens: number
        total_cost: number
    }
    timestamp: string
}

export interface OpenRouterOptions {
    model: string
    prompt: string
    apiKey: string
    pdfUrl?: string
    pdfEngine?: 'cloudflare-ai' | 'mistral-ocr' | 'native'
    maxTokens?: number
}

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

async function sendRequest(
    model: string,
    content: any[],
    apiKey: string,
    pdfEngine: string | undefined,
    hasPdf: boolean,
    maxTokens: number,
): Promise<any> {
    const body: any = {
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content }]
    }

    if (hasPdf && pdfEngine) {
        body.plugins = [{ id: 'file-parser', pdf: { engine: pdfEngine } }]
    }

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

/**
 * Call OpenRouter API with automatic cloudflare-ai → mistral-ocr fallback
 */
export async function callOpenRouter(options: OpenRouterOptions): Promise<OpenRouterResponse> {
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

    const generationId = data.id
    const actualModel = data.model || model

    let totalCost = 0
    let nativePromptTokens = data.usage?.prompt_tokens || 0
    let nativeCompletionTokens = data.usage?.completion_tokens || 0

    if (generationId) {
        try {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const genRes = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            })
            const genData = await genRes.json()
            if (genData.data) {
                totalCost = genData.data.total_cost || 0
                nativePromptTokens = genData.data.native_tokens_prompt || nativePromptTokens
                nativeCompletionTokens = genData.data.native_tokens_completion || nativeCompletionTokens
            }
        } catch (e) {
            console.log('Generation API fetch failed:', e)
        }
    }

    return {
        content: data.choices?.[0]?.message?.content || '',
        model: actualModel,
        generation_id: generationId,
        usage: {
            prompt_tokens: nativePromptTokens,
            completion_tokens: nativeCompletionTokens,
            total_cost: totalCost
        },
        timestamp: new Date().toISOString()
    }
}

/**
 * Parse JSON from LLM response
 */
export function parseJSON(content: string): any {
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
