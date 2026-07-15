/**
 * arXiv API Client
 * Search arXiv for preprints
 */

interface ArxivResult {
    success: boolean
    source: 'arxiv'
    raw?: any
    error?: string
    _debug?: any
}

export async function searchArxiv(title: string, doi?: string): Promise<ArxivResult | null> {
    if (!title && !doi) return null
    const debug: any = { input_title: title, input_doi: doi, attempts: [] }

    try {
        // For arXiv, extract arXiv ID from DOI if present
        if (doi && doi.includes('arXiv')) {
            const arxivMatch = doi.match(/arXiv\.?(\d+\.\d+)/i)
            if (arxivMatch) {
                const arxivUrl = `https://export.arxiv.org/api/query?id_list=${arxivMatch[1]}&max_results=1`
                const start = Date.now()
                const arxivRes = await fetch(arxivUrl)
                const time = Date.now() - start

                if (arxivRes.ok) {
                    const raw = await arxivRes.text()
                    if (raw.includes('<entry>')) {
                        debug.attempts.push({ method: 'doi_extracted', status: 'success', time_ms: time })
                        return { success: true, source: 'arxiv', raw, _debug: debug }
                    }
                } else {
                    debug.attempts.push({ method: 'doi_extracted', status: 'failed', error: `http ${arxivRes.status}`, url: arxivUrl, time_ms: time })
                }
            } else {
                debug.attempts.push({ method: 'doi_extracted', status: 'failed', error: 'regex mismatch', time_ms: 0 })
            }
        }

        // Fallback to title search
        const url = `https://export.arxiv.org/api/query?search_query=ti:${encodeURIComponent(title)}&max_results=1`
        const start = Date.now()
        const res = await fetch(url)
        const time = Date.now() - start

        if (!res.ok) {
            debug.attempts.push({ method: 'title', status: 'failed', error: `http ${res.status}`, url: url, time_ms: time })
            return { success: false, source: 'arxiv', error: `http error ${res.status}`, _debug: debug }
        }

        const raw = await res.text()
        if (!raw.includes('<entry>')) {
            debug.attempts.push({ method: 'title', status: 'failed', error: 'no entry tag', url: url, time_ms: time })
            return { success: false, source: 'arxiv', error: 'No match found', _debug: debug }
        }

        debug.attempts.push({ method: 'title', status: 'success', time_ms: time })
        return { success: true, source: 'arxiv', raw, _debug: debug }
    } catch (e: any) {
        debug.error = e.message
        return { success: false, source: 'arxiv', error: e.message, _debug: debug }
    }
}
