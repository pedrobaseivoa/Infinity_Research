/**
 * Unpaywall API Client
 * Search Unpaywall for open access links
 */

interface UnpaywallResult {
    success: boolean
    source: 'unpaywall'
    raw?: any
    error?: string
    _debug?: any
}

export async function searchUnpaywall(title: string, doi?: string): Promise<UnpaywallResult | null> {
    if (!title && !doi) return null
    const debug: any = { input_title: title, input_doi: doi, attempts: [] }

    try {
        // Try DOI first if available (direct lookup)
        if (doi) {
            const doiUrl = `https://api.unpaywall.org/v2/${doi}?email=contact@infinityresearch.com`
            debug.doi_url = doiUrl
            const start = Date.now()
            const doiRes = await fetch(doiUrl)
            const time = Date.now() - start

            if (doiRes.ok) {
                const raw = await doiRes.json()
                if (raw.doi) {
                    debug.attempts.push({ method: 'doi', status: 'success', time_ms: time })
                    return { success: true, source: 'unpaywall', raw, _debug: debug }
                }
            } else {
                debug.attempts.push({ method: 'doi', status: 'failed', error: `http ${doiRes.status}`, url: doiUrl, time_ms: time })
            }
        }

        // Fallback to title search
        const url = `https://api.unpaywall.org/v2/search?query=${encodeURIComponent(title)}&email=contact@infinityresearch.com`
        debug.search_url = url
        const start = Date.now()
        const res = await fetch(url)
        const time = Date.now() - start

        if (!res.ok) {
            debug.attempts.push({ method: 'title', status: 'failed', error: `http ${res.status}`, url: url, time_ms: time })
            return { success: false, source: 'unpaywall', error: `http error ${res.status}`, _debug: debug }
        }

        const data = await res.json()
        const raw = data.results?.[0]?.response

        if (!raw) {
            debug.attempts.push({ method: 'title', status: 'failed', error: 'no results', url: url, time_ms: time })
            return { success: false, source: 'unpaywall', error: 'No match found', _debug: debug }
        }

        debug.attempts.push({ method: 'title', status: 'success', time_ms: time })
        return { success: true, source: 'unpaywall', raw, _debug: debug }

    } catch (e: any) {
        debug.error = e.message
        return { success: false, source: 'unpaywall', error: e.message, _debug: debug }
    }
}
