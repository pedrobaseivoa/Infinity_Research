/**
 * CrossRef API Client
 * Search CrossRef for DOI and publication metadata
 */

interface CrossRefResult {
    success: boolean
    source: 'crossref'
    raw?: any
    error?: string
    _debug?: any
}

export async function searchCrossRef(title: string, doi?: string): Promise<CrossRefResult | null> {
    if (!title && !doi) return null
    const debug: any = { input_title: title, input_doi: doi, attempts: [] }

    try {
        // Try DOI first if available (direct lookup)
        if (doi) {
            const doiUrl = `https://api.crossref.org/works/${doi}`
            const start = Date.now()
            const doiRes = await fetch(doiUrl)
            const time = Date.now() - start

            if (doiRes.ok) {
                const data = await doiRes.json()
                if (data.message?.title) {
                    debug.attempts.push({ method: 'doi', status: 'success', time_ms: time })
                    return { success: true, source: 'crossref', raw: data.message, _debug: debug }
                }
            } else {
                debug.attempts.push({ method: 'doi', status: 'failed', error: `http ${doiRes.status}`, url: doiUrl, time_ms: time })
            }
        }

        // Fallback to title search
        const url = `https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=1`
        const start = Date.now()
        const res = await fetch(url)
        const time = Date.now() - start

        if (!res.ok) {
            debug.attempts.push({ method: 'title', status: 'failed', error: `http ${res.status}`, url: url, time_ms: time })
            return { success: false, source: 'crossref', error: `HTTP ${res.status}`, _debug: debug }
        }

        const data = await res.json()
        const raw = data.message?.items?.[0]

        if (!raw) {
            debug.attempts.push({ method: 'title', status: 'failed', error: 'no results', url: url, time_ms: time })
            return { success: false, source: 'crossref', error: 'No match found', _debug: debug }
        }

        debug.attempts.push({ method: 'title', status: 'success', time_ms: time })
        return { success: true, source: 'crossref', raw, _debug: debug }
    } catch (e: any) {
        debug.error = e.message
        return { success: false, source: 'crossref', error: e.message, _debug: debug }
    }
}
