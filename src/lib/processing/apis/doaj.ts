/**
 * DOAJ API Client
 * Search Directory of Open Access Journals
 */

interface DOAJResult {
    success: boolean
    source: 'doaj'
    raw?: any
    error?: string
    _debug?: any
}

export async function searchDOAJ(title: string, doi?: string): Promise<DOAJResult | null> {
    if (!title && !doi) return null
    const debug: any = { input_title: title, input_doi: doi, attempts: [] }

    try {
        // Use title search - DOI combinations fail based on testing
        const query = title || doi || ''
        const url = `https://doaj.org/api/v2/search/articles/${encodeURIComponent(query)}`
        const start = Date.now()
        const res = await fetch(url)
        const time = Date.now() - start

        if (!res.ok) {
            debug.attempts.push({ method: 'query_combined', status: 'failed', error: `http ${res.status}`, url: url, time_ms: time })
            return { success: false, source: 'doaj', error: `http error ${res.status}`, _debug: debug }
        }

        const data = await res.json()
        const raw = data.results?.[0]

        if (!raw) {
            debug.attempts.push({ method: 'query_combined', status: 'failed', error: 'no results', url: url, time_ms: time })
            return { success: false, source: 'doaj', error: 'No match found', _debug: debug }
        }

        debug.attempts.push({ method: 'query_combined', status: 'success', time_ms: time })
        return { success: true, source: 'doaj', raw, _debug: debug }
    } catch (e: any) {
        debug.error = e.message
        return { success: false, source: 'doaj', error: e.message, _debug: debug }
    }
}
