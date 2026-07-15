import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/settings/validate-key
 * Validates an API key by making a minimal test call
 *
 * Body: { provider: 'openrouter' | 'semantic_scholar' | 'openalex' | 'core', key: string }
 * Returns: { valid: boolean, error?: string, details?: object }
 */
export async function POST(request: NextRequest) {
    try {
        const { provider, key } = await request.json()

        if (!provider || !key) {
            return NextResponse.json(
                { valid: false, error: 'Missing provider or key' },
                { status: 400 }
            )
        }

        switch (provider) {
            case 'openrouter':
                return await validateOpenRouter(key)
            case 'semantic_scholar':
                return await validateSemanticScholar(key)
            case 'openalex':
                return await validateOpenAlex(key)
            case 'core':
                return await validateCore(key)
            default:
                return NextResponse.json(
                    { valid: false, error: `Unknown provider: ${provider}` },
                    { status: 400 }
                )
        }
    } catch (error: any) {
        return NextResponse.json(
            { valid: false, error: error.message },
            { status: 500 }
        )
    }
}

/**
 * Validate OpenRouter API key by fetching available models
 */
async function validateOpenRouter(key: string) {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${key}`,
                'HTTP-Referer': 'https://infinity.research',
                'X-Title': 'Infinity Research - Key Validation'
            }
        })

        if (response.status === 401) {
            return NextResponse.json({
                valid: false,
                error: 'Invalid API key'
            })
        }

        if (!response.ok) {
            const text = await response.text()
            return NextResponse.json({
                valid: false,
                error: `API error: ${response.status}`,
                details: { status: response.status, body: text.slice(0, 200) }
            })
        }

        const data = await response.json()
        return NextResponse.json({
            valid: true,
            details: {
                modelsAvailable: data.data?.length || 0
            }
        })
    } catch (error: any) {
        return NextResponse.json({
            valid: false,
            error: `Network error: ${error.message}`
        })
    }
}

/**
 * Validate Semantic Scholar API key
 */
async function validateSemanticScholar(key: string) {
    try {
        // Test with a simple paper lookup
        const response = await fetch(
            'https://api.semanticscholar.org/graph/v1/paper/10.1038/nature12373?fields=title',
            {
                headers: { 'x-api-key': key }
            }
        )

        if (response.status === 401 || response.status === 403) {
            return NextResponse.json({ valid: false, error: 'Invalid API key' })
        }

        if (response.ok) {
            return NextResponse.json({ valid: true })
        }

        return NextResponse.json({
            valid: false,
            error: `API error: ${response.status}`
        })
    } catch (error: any) {
        return NextResponse.json({ valid: false, error: error.message })
    }
}

/**
 * Validate OpenAlex API key (or email for polite pool)
 */
async function validateOpenAlex(key: string) {
    try {
        // OpenAlex uses email for polite pool, not a traditional API key
        const url = key.includes('@')
            ? `https://api.openalex.org/works?mailto=${encodeURIComponent(key)}&per_page=1`
            : `https://api.openalex.org/works?api_key=${key}&per_page=1`

        const response = await fetch(url)

        if (response.ok) {
            return NextResponse.json({ valid: true })
        }

        return NextResponse.json({
            valid: false,
            error: `API error: ${response.status}`
        })
    } catch (error: any) {
        return NextResponse.json({ valid: false, error: error.message })
    }
}

/**
 * Validate CORE API key
 */
async function validateCore(key: string) {
    try {
        const response = await fetch(
            'https://api.core.ac.uk/v3/search/works?q=test&limit=1',
            {
                headers: { 'Authorization': `Bearer ${key}` }
            }
        )

        if (response.status === 401 || response.status === 403) {
            return NextResponse.json({ valid: false, error: 'Invalid API key' })
        }

        if (response.ok) {
            return NextResponse.json({ valid: true })
        }

        return NextResponse.json({
            valid: false,
            error: `API error: ${response.status}`
        })
    } catch (error: any) {
        return NextResponse.json({ valid: false, error: error.message })
    }
}
