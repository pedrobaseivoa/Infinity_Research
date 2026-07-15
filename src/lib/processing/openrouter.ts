/**
 * OpenRouter API Client (BYOK - Bring Your Own Key)
 * Calls OpenRouter AI models using the user's API key
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

/**
 * Call OpenRouter API with user's API key.
 * Automatically falls back from cloudflare-ai to mistral-ocr if parsing fails.
 */
export async function callOpenRouter(options: OpenRouterOptions): Promise<OpenRouterResponse> {
    const { model, prompt, apiKey, pdfUrl, pdfEngine = 'cloudflare-ai', maxTokens = 16000 } = options

    const content: any[] = [{ type: 'text', text: prompt }]

    if (pdfUrl) {
        const pdfResponse = await fetch(pdfUrl)
        const pdfBuffer = await pdfResponse.arrayBuffer()
        const base64 = Buffer.from(pdfBuffer).toString('base64')
        content.push({
            type: 'file',
            file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${base64}` }
        })
    }

    const engines: Array<'cloudflare-ai' | 'mistral-ocr' | 'native'> = pdfUrl
        ? (pdfEngine === 'cloudflare-ai' ? ['cloudflare-ai', 'mistral-ocr'] : [pdfEngine])
        : []

    const attemptRequest = async (engine?: 'cloudflare-ai' | 'mistral-ocr' | 'native') => {
        const body: any = {
            model,
            max_tokens: maxTokens,
            messages: [{ role: 'user', content }]
        }

        if (pdfUrl && engine) {
            body.plugins = [{ id: 'file-parser', pdf: { engine } }]
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

    let data: any
    if (engines.length > 1) {
        try {
            data = await attemptRequest(engines[0])
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message.toLowerCase() : ''
            if (msg.includes('failed to parse document') || msg.includes('file-parser') || msg.includes('invalid input')) {
                console.log(`PDF cloudflare-ai parsing failed, falling back to mistral-ocr engine for ${model}`)
                data = await attemptRequest(engines[1])
            } else {
                throw err
            }
        }
    } else {
        data = await attemptRequest(engines[0])
    }

    const generationId = data.id
    const actualModel = data.model || model

    let totalCost = 0
    let nativePromptTokens = data.usage?.prompt_tokens || 0
    let nativeCompletionTokens = data.usage?.completion_tokens || 0

    if (generationId) {
        const fetchGeneration = async () => {
            const res = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            })
            return res.json()
        }

        try {
            await new Promise(resolve => setTimeout(resolve, 2000))
            let genData = await fetchGeneration()

            if (genData.error?.code === 404) {
                console.log('Generation not found, retrying in 1s...')
                await new Promise(resolve => setTimeout(resolve, 1000))
                genData = await fetchGeneration()
            }

            console.log(`Generation ${generationId}: cost=$${genData.data?.total_cost || 0}`)

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
 * Parse JSON from LLM response (handles markdown code blocks)
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
    } catch (e) {
        return { error: 'Failed to parse JSON', raw: content.substring(0, 500) }
    }
}
