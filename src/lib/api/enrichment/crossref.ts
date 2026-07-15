
// CrossRef API Helper
// Docs: https://api.crossref.org/

export async function searchCrossRef(title: string): Promise<any | null> {
    if (!title) return null;

    try {
        const url = `https://api.crossref.org/works?query=${encodeURIComponent(title)}&rows=1&mailto=research@infinity.com`;
        const res = await fetch(url);
        if (!res.ok) return null;

        const data = await res.json();
        const items = data.message?.items;

        if (!items || items.length === 0) return null;

        const bestMatch = items[0];

        return {
            success: true,
            source: 'CrossRef',
            title: bestMatch.title?.[0] || 'Unknown Title',
            doi: bestMatch.DOI,
            publisher: bestMatch.publisher,
            published_online: bestMatch['published-online'],
            author: bestMatch.author,
            raw: bestMatch // Full raw data
        };

    } catch (error) {
        console.error("CrossRef Helper Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error" };
    }
}
