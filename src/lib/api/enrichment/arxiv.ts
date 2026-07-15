
// arXiv API Helper
// Docs: https://arxiv.org/help/api/

export async function searchArxiv(title: string): Promise<any | null> {
    if (!title) return null;

    try {
        const query = `ti:"${title.replace(/"/g, '')}"`;
        const url = `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=1`;

        const res = await fetch(url);
        if (!res.ok) return null;

        const xmlText = await res.text();

        if (!xmlText.includes('<entry>')) return null;

        const titleMatch = xmlText.match(/<title>(.*?)<\/title>/);
        const summaryMatch = xmlText.match(/<summary>(.*?)<\/summary>/s);
        const publishedMatch = xmlText.match(/<published>(.*?)<\/published>/);
        const idMatch = xmlText.match(/<id>(.*?)<\/id>/);

        if (!titleMatch || !idMatch) return null;

        const authors: string[] = [];
        const authorMatches = xmlText.matchAll(/<author>\s*<name>(.*?)<\/name>\s*<\/author>/g);
        for (const match of authorMatches) {
            authors.push(match[1]);
        }

        return {
            success: true,
            source: 'arXiv',
            title: titleMatch[1].trim(),
            summary: summaryMatch ? summaryMatch[1].trim() : '',
            published: publishedMatch ? publishedMatch[1] : '',
            id: idMatch[1],
            authors: authors,
            raw: { xml: xmlText } // Return Raw XML content 
        };

    } catch (error) {
        console.error("arXiv Helper Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error" };
    }
}
