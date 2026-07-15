/**
 * ORCID API Client
 * Search ORCID for author identifiers
 */

interface ORCIDResult {
    success: boolean
    source: 'orcid'
    raw?: any
    error?: string
    _debug?: any
}

export async function searchORCID(authorName: string): Promise<ORCIDResult | null> {
    if (!authorName) return null
    const debug: any = { input_author: authorName, attempts: [] }

    try {
        const url = `https://pub.orcid.org/v3.0/search/?q=${encodeURIComponent(authorName)}`
        const start = Date.now()
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
        const time = Date.now() - start

        if (!res.ok) {
            debug.attempts.push({ method: 'author', status: 'failed', error: `http ${res.status}`, url: url, time_ms: time })
            return { success: false, source: 'orcid', error: `http error ${res.status}`, _debug: debug }
        }

        const raw = await res.json()
        if (!raw.result?.[0]) {
            debug.attempts.push({ method: 'author', status: 'failed', error: 'no results', url: url, time_ms: time })
            return { success: false, source: 'orcid', error: 'No match found', _debug: debug }
        }

        // Optimize: Take top 3 only and simplify structure
        const top3 = raw.result.slice(0, 3).map((item: any) => ({
            id: item['orcid-identifier']?.path,
            uri: item['orcid-identifier']?.uri
        }))

        debug.attempts.push({ method: 'author', status: 'success', time_ms: time })
        return { success: true, source: 'orcid', raw: top3, _debug: debug }
    } catch (e: any) {
        debug.error = e.message
        return { success: false, source: 'orcid', error: e.message, _debug: debug }
    }
}
