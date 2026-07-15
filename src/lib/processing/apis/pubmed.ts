/**
 * PubMed API Client
 * Search NCBI PubMed for article metadata
 */

interface PubMedResult {
    success: boolean
    source: 'pubmed'
    raw?: any
    error?: string
    _debug?: any
}

export async function searchPubMed(title: string, doi?: string): Promise<PubMedResult | null> {
    if (!title && !doi) return null
    const debug: any = { input_title: title, input_doi: doi, attempts: [] }

    try {
        // Try DOI first if available
        if (doi) {
            const doiUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(doi)}[DOI]&retmode=json`
            const doiStart = Date.now()
            const doiRes = await fetch(doiUrl)
            const doiTime = Date.now() - doiStart

            if (doiRes.ok) {
                const doiData = await doiRes.json()
                const pmidFromDoi = doiData.esearchresult?.idlist?.[0]

                if (pmidFromDoi) {
                    debug.attempts.push({ method: 'doi', status: 'success', time_ms: doiTime, pmid: pmidFromDoi })
                    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmidFromDoi}&retmode=json`
                    const summaryRes = await fetch(summaryUrl)
                    if (summaryRes.ok) {
                        const summaryData = await summaryRes.json()
                        const raw = summaryData.result?.[pmidFromDoi]
                        if (raw) return { success: true, source: 'pubmed', raw, _debug: debug }
                    }
                } else {
                    debug.attempts.push({ method: 'doi', status: 'failed', error: 'id not found', time_ms: doiTime })
                }
            } else {
                debug.attempts.push({ method: 'doi', status: 'failed', error: `http ${doiRes.status}`, time_ms: doiTime })
            }
        }

        // Fallback to title search
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(title)}&retmode=json`
        const searchStart = Date.now()
        const searchRes = await fetch(searchUrl)
        const searchTime = Date.now() - searchStart

        if (!searchRes.ok) {
            debug.attempts.push({ method: 'title', status: 'failed', error: `http ${searchRes.status}`, time_ms: searchTime })
            return { success: false, source: 'pubmed', error: `http error ${searchRes.status}`, _debug: debug }
        }

        const searchData = await searchRes.json()
        const pmid = searchData.esearchresult?.idlist?.[0]

        if (!pmid) {
            debug.attempts.push({ method: 'title', status: 'failed', error: 'id not found', time_ms: searchTime })
            return { success: false, source: 'pubmed', error: 'No match found', _debug: debug }
        }

        debug.attempts.push({ method: 'title', status: 'success', time_ms: searchTime, pmid })

        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`
        const summaryRes = await fetch(summaryUrl)
        if (!summaryRes.ok) return { success: false, source: 'pubmed', error: 'Summary fetch failed', _debug: debug }
        const summaryData = await summaryRes.json()
        const raw = summaryData.result?.[pmid]
        if (!raw) return { success: false, source: 'pubmed', error: 'No raw data', _debug: debug }

        return { success: true, source: 'pubmed', raw, _debug: debug }
    } catch (e: any) {
        debug.error = e.message
        return { success: false, source: 'pubmed', error: e.message, _debug: debug }
    }
}
