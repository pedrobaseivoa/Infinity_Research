/**
 * Semantic Scholar API Client
 * Search Semantic Scholar for paper metadata
 */

interface SemanticScholarResult {
    success: boolean
    source: 'semantic_scholar'
    raw?: any
    error?: string
    _debug?: any
}

export async function searchSemanticScholar(title: string, doi?: string, apiKey?: string | null): Promise<SemanticScholarResult | null> {
    if (!title && !doi) return null
    const debug: any = { input_title: title, input_doi: doi, attempts: [] }

    try {
        const headers: Record<string, string> = {
            'User-Agent': 'InfinityResearch/1.0'
        }
        if (apiKey) {
            headers['x-api-key'] = apiKey
        }
        debug.api_key_present = !!apiKey

        // Try DOI first if available (more reliable)
        if (doi) {
            const doiUrl = `https://api.semanticscholar.org/graph/v1/paper/${doi}?fields=title,externalIds,citationCount,authors,year,abstract`
            debug.doi_url = doiUrl
            const start = Date.now()
            const doiRes = await fetch(doiUrl, { headers })
            const time = Date.now() - start

            if (doiRes.ok) {
                const raw = await doiRes.json()
                if (raw.title) {
                    debug.attempts.push({ method: 'doi', status: 'success', time_ms: time })
                    return { success: true, source: 'semantic_scholar', raw, _debug: debug }
                }
            } else {
                debug.attempts.push({ method: 'doi', status: 'failed', error: `http ${doiRes.status}`, url: doiUrl, time_ms: time })
            }
        }

        // Fallback to title search
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=1&fields=title,externalIds,citationCount,authors,year,abstract`
        debug.search_url = url
        const start = Date.now()
        const res = await fetch(url, { headers })
        const time = Date.now() - start

        if (!res.ok) {
            debug.attempts.push({ method: 'title', status: 'failed', error: `http ${res.status}`, url: url, time_ms: time })
            return { success: false, source: 'semantic_scholar', error: `http error ${res.status}`, _debug: debug }
        }

        const data = await res.json()
        const raw = data.data?.[0]

        if (!raw) {
            debug.attempts.push({ method: 'title', status: 'failed', error: 'no results', url: url, time_ms: time })
            return { success: false, source: 'semantic_scholar', error: 'No match found', _debug: debug }
        }

        debug.attempts.push({ method: 'title', status: 'success', time_ms: time })
        return { success: true, source: 'semantic_scholar', raw, _debug: debug }
    } catch (e: any) {
        debug.error = e.message
        return { success: false, source: 'semantic_scholar', error: e.message, _debug: debug }
    }
}
