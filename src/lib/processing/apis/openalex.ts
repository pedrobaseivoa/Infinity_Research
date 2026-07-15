/**
 * OpenAlex API Client
 * Search OpenAlex for academic work metadata
 */

interface OpenAlexResult {
    success: boolean
    source: 'openalex'
    raw?: any
    error?: string
    _debug?: any
}

export async function searchOpenAlex(title: string, doi?: string, apiKey?: string | null): Promise<OpenAlexResult | null> {
    if (!title && !doi) return null
    const debug: any = { input_title: title, input_doi: doi, attempts: [] }

    try {
        const headers: Record<string, string> = { 'User-Agent': 'InfinityResearch/1.0' }
        if (apiKey) {
            headers['api_key'] = apiKey
        }
        debug.api_key_present = !!apiKey

        // Try DOI first if available (more precise)
        if (doi) {
            const doiUrl = `https://api.openalex.org/works/https://doi.org/${doi}`
            const startStr = Date.now()
            const doiRes = await fetch(doiUrl, { headers })
            const time = Date.now() - startStr

            if (doiRes.ok) {
                const raw = await doiRes.json()
                if (raw.title) {
                    debug.attempts.push({ method: 'doi', status: 'success', time_ms: time })
                    return { success: true, source: 'openalex', raw, _debug: debug }
                }
            } else {
                debug.attempts.push({ method: 'doi', status: 'failed', error: `http ${doiRes.status}`, url: doiUrl, time_ms: time })
            }
        }

        // Fallback to title search
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per-page=1`
        debug.search_url = url
        const startStr = Date.now()
        const res = await fetch(url, { headers })
        const time = Date.now() - startStr

        if (!res.ok) {
            debug.attempts.push({ method: 'title', status: 'failed', error: `http ${res.status}`, url: url, time_ms: time })
            return { success: false, source: 'openalex', error: `http error ${res.status}`, _debug: debug }
        }

        const data = await res.json()
        const raw = data.results?.[0]

        if (!raw) {
            debug.attempts.push({ method: 'title', status: 'failed', error: 'no results', url: url, time_ms: time })
            return { success: false, source: 'openalex', error: 'No match found', _debug: debug }
        }

        debug.attempts.push({ method: 'title', status: 'success', time_ms: time })
        return { success: true, source: 'openalex', raw, _debug: debug }
    } catch (e: any) {
        debug.error = e.message
        return { success: false, source: 'openalex', error: e.message, _debug: debug }
    }
}
