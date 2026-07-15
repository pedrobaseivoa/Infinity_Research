
// OpenAlex API Helper
// Docs: https://docs.openalex.org/

interface OpenAlexResult {
    title: string;
    id: string;
    doi?: string;
    cited_by_count: number;
    publication_year: number;
    source: 'OpenAlex';
    [key: string]: any;
}

export async function searchOpenAlex(title: string): Promise<any | null> {
    if (!title) return null;

    try {
        const apiKey = process.env.OPENALEX_API_KEY || "";
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per-page=1`;

        const headers: Record<string, string> = {
            'User-Agent': 'InfinityResearch/1.0 (mailto:contact@infinityresearch.com)'
        };

        // OpenAlex uses api_key query param OR header
        if (apiKey) {
            headers['api_key'] = apiKey;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) {
            console.warn(`OpenAlex Error: ${res.status}`);
            return null;
        }

        const data = await res.json();
        const results = data.results;

        if (!results || results.length === 0) return null;

        const bestMatch = results[0];

        return {
            success: true,
            source: 'OpenAlex',
            title: bestMatch.title,
            id: bestMatch.id,
            doi: bestMatch.doi,
            cited_by_count: bestMatch.cited_by_count,
            publication_year: bestMatch.publication_year,
            open_access: bestMatch.open_access,
            authors: bestMatch.authorships?.map((a: any) => a.author?.display_name) || [],
            raw: bestMatch
        };

    } catch (error) {
        console.error("OpenAlex Helper Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error" };
    }
}
