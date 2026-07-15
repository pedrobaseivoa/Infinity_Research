/**
 * Europe PMC API Client
 * Search Europe PubMed Central for article metadata
 */

interface EuropePMCResult {
    success: boolean
    source: 'europe_pmc'
    raw?: any
    error?: string
    _debug?: any
}

export async function searchEuropePMC(title: string, doi?: string): Promise<EuropePMCResult | null> {
    if (!title && !doi) return null
    const debug: any = { input_title: title, input_doi: doi, attempts: [] }

    try {
        // Try DOI first if available
        if (doi) {
            const doiUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:${doi}&format=json&pageSize=1`
            const start = Date.now()
            const doiRes = await fetch(doiUrl)
            const time = Date.now() - start

            if (doiRes.ok) {
                const data = await doiRes.json()
                const raw = data.resultList?.result?.[0]
                if (raw) {
                    debug.attempts.push({ method: 'doi', status: 'success', time_ms: time })
                    return { success: true, source: 'europe_pmc', raw, _debug: debug }
                } else {
                    debug.attempts.push({ method: 'doi', status: 'failed', error: 'no results', url: doiUrl, time_ms: time })
                }
            } else {
                debug.attempts.push({ method: 'doi', status: 'failed', error: `http ${doiRes.status}`, url: doiUrl, time_ms: time })
            }
        }

        // Fallback to title search
        const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(title)}&format=json&pageSize=1`
        const start = Date.now()
        const res = await fetch(url)
        const time = Date.now() - start

        if (!res.ok) {
            debug.attempts.push({ method: 'title', status: 'failed', error: `http ${res.status}`, url: url, time_ms: time })
            return { success: false, source: 'europe_pmc', error: `http error ${res.status}`, _debug: debug }
        }

        const data = await res.json()
        const raw = data.resultList?.result?.[0]

        if (!raw) {
            debug.attempts.push({ method: 'title', status: 'failed', error: 'no results', url: url, time_ms: time })
            return { success: false, source: 'europe_pmc', error: 'No match found', _debug: debug }
        }

        debug.attempts.push({ method: 'title', status: 'success', time_ms: time })
        return { success: true, source: 'europe_pmc', raw, _debug: debug }
    } catch (e: any) {
        debug.error = e.message
        return { success: false, source: 'europe_pmc', error: e.message, _debug: debug }
    }
}
