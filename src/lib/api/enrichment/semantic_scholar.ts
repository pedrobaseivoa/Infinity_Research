
// Semantic Scholar API Helper
// Docs: https://api.semanticscholar.org/

export async function searchSemanticScholar(title: string, doi?: string): Promise<any | null> {
    if (!title && !doi) return null;

    try {
        const fields = "title,year,abstract,citationCount,isOpenAccess,openAccessPdf,externalIds,journal,authors";
        const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY || "";

        const headers: Record<string, string> = {
            "User-Agent": "InfinityResearch/1.0"
        };

        if (apiKey) {
            headers['x-api-key'] = apiKey;
        }

        // Try by DOI first if available (most reliable)
        if (doi) {
            const doiUrl = `https://api.semanticscholar.org/graph/v1/paper/${doi}?fields=${fields}`;
            const doiRes = await fetch(doiUrl, { headers });

            if (doiRes.ok) {
                const paper = await doiRes.json();
                return {
                    success: true,
                    source: 'Semantic Scholar',
                    title: paper.title,
                    doi: paper.externalIds?.DOI || doi,
                    year: paper.year,
                    citationCount: paper.citationCount,
                    openAccessPdf: paper.openAccessPdf,
                    abstract: paper.abstract,
                    paperId: paper.paperId,
                    authors: paper.authors?.map((a: any) => a.name) || [],
                    raw: paper
                };
            }
        }

        // Fallback: Use keyword search with title
        const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=1&fields=${fields}`;
        const res = await fetch(searchUrl, { headers });

        if (!res.ok) {
            if (res.status === 400 || res.status === 403 || res.status === 429) {
                console.warn(`Semantic Scholar Error (${res.status}). Trying alternate endpoint...`);

                // Try bulk search as last resort
                const bulkUrl = `https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=${encodeURIComponent(title)}&limit=1&fields=title,year,citationCount`;
                const bulkRes = await fetch(bulkUrl, { headers });

                if (bulkRes.ok) {
                    const bulkData = await bulkRes.json();
                    if (bulkData.data?.[0]) {
                        return {
                            success: true,
                            source: 'Semantic Scholar',
                            ...bulkData.data[0],
                            raw: bulkData.data[0]
                        };
                    }
                }

                return { success: false, status: 'error', error: `HTTP ${res.status}` };
            }
            return null;
        }

        const data = await res.json();
        if (!data.data || data.data.length === 0) return null;

        const paper = data.data[0];

        return {
            success: true,
            source: 'Semantic Scholar',
            title: paper.title,
            doi: paper.externalIds?.DOI || paper.doi,
            year: paper.year,
            citationCount: paper.citationCount,
            openAccessPdf: paper.openAccessPdf,
            abstract: paper.abstract,
            paperId: paper.paperId,
            authors: paper.authors?.map((a: any) => a.name) || [],
            raw: paper
        };

    } catch (error) {
        console.error("Semantic Scholar Helper Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error" };
    }
}
