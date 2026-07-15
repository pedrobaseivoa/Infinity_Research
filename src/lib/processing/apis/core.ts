/**
 * CORE API Client
 * Search CORE for open access research outputs
 * Requires API key to function
 */

interface COREResult {
    success: boolean
    source: 'core'
    raw?: any
    error?: string
    _debug?: any
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        return await fetch(url, { ...options, signal: controller.signal })
    } finally {
        clearTimeout(timer)
    }
}

export async function searchCORE(title: string, doi?: string, apiKey?: string | null): Promise<COREResult | null> {
    if ((!title && !doi) || !apiKey) return null
    const debug: any = { input_title: title, input_doi: doi, attempts: [] }

    const query = doi ? `${title} ${doi}` : title
    const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(query)}&limit=1`
    const headers = { 'Authorization': `Bearer ${apiKey}` }

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const start = Date.now()
            const res = await fetchWithTimeout(url, { headers }, 8000)
            const time = Date.now() - start

            if (res.status === 500 || res.status === 502 || res.status === 503) {
                debug.attempts.push({ attempt: attempt + 1, status: 'server_error', error: `http ${res.status}`, time_ms: time })
                if (attempt === 0) { await new Promise(r => setTimeout(r, 2000)); continue }
                return { success: false, source: 'core', error: `Server error ${res.status} after retry`, _debug: debug }
            }

            if (!res.ok) {
                debug.attempts.push({ attempt: attempt + 1, status: 'failed', error: `http ${res.status}`, time_ms: time })
                return { success: false, source: 'core', error: `HTTP ${res.status}`, _debug: debug }
            }

            const data = await res.json()
            const raw = data.results?.[0]

            if (!raw) {
                debug.attempts.push({ attempt: attempt + 1, status: 'no_results', time_ms: time })
                return { success: false, source: 'core', error: 'No match found', _debug: debug }
            }

            debug.attempts.push({ attempt: attempt + 1, status: 'success', time_ms: time })
            return { success: true, source: 'core', raw, _debug: debug }
        } catch (e: any) {
            const isTimeout = e.name === 'AbortError'
            debug.attempts.push({ attempt: attempt + 1, status: isTimeout ? 'timeout' : 'error', error: e.message })
            if (attempt === 0 && isTimeout) { await new Promise(r => setTimeout(r, 1000)); continue }
            return { success: false, source: 'core', error: isTimeout ? 'Timeout (8s)' : e.message, _debug: debug }
        }
    }

    return { success: false, source: 'core', error: 'Max retries exceeded', _debug: debug }
}
