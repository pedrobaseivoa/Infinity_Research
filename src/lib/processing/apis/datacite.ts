/**
 * DataCite API Client
 * Search DataCite for datasets and DOIs
 */

interface DataCiteResult {
    success: boolean
    source: 'datacite'
    raw?: any
    error?: string
    _debug?: any
}

export async function searchDataCite(title: string, doi?: string): Promise<DataCiteResult | null> {
    if (!title && !doi) return null
    const debug: any = { input_title: title, input_doi: doi, attempts: [] }

    try {
        const query = doi || title
        const url = `https://api.datacite.org/dois?query=${encodeURIComponent(query)}&page[size]=1`
        const start = Date.now()
        const res = await fetch(url)
        const time = Date.now() - start

        if (!res.ok) {
            debug.attempts.push({ method: 'query_combined', status: 'failed', error: `http ${res.status}`, url: url, time_ms: time })
            return { success: false, source: 'datacite', error: `http error ${res.status}`, _debug: debug }
        }

        const data = await res.json()
        const raw = data.data?.[0]

        if (!raw) {
            debug.attempts.push({ method: 'query_combined', status: 'failed', error: 'no results', url: url, time_ms: time })
            return { success: false, source: 'datacite', error: 'No match found', _debug: debug }
        }

        debug.attempts.push({ method: 'query_combined', status: 'success', time_ms: time })
        return { success: true, source: 'datacite', raw, _debug: debug }
    } catch (e: any) {
        debug.error = e.message
        return { success: false, source: 'datacite', error: e.message, _debug: debug }
    }
}
