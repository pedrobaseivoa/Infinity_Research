
// DOAJ API Helper
// Docs: https://doaj.org/api/docs

export async function searchDOAJ(doi: string): Promise<any | null> {
    if (!doi) return null;

    try {
        const url = `https://doaj.org/api/v2/search/articles/${encodeURIComponent(doi)}`;

        const res = await fetch(url);
        if (!res.ok) return null;

        const data = await res.json();
        if (!data.results || data.results.length === 0) return null;

        const hit = data.results[0];
        const bibjson = hit.bibjson;

        return {
            success: true,
            source: 'DOAJ',
            title: bibjson.title,
            doi: doi,
            journal: bibjson.journal?.title,
            issn: bibjson.journal?.issns,
            raw: hit // Full raw data
        };

    } catch (error) {
        console.error("DOAJ Helper Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error" };
    }
}
