
// CORE API Helper
// Docs: https://api.core.ac.uk/

export async function searchCore(title: string): Promise<any | null> {
    if (!title) return null;

    try {
        const apiKey = process.env.CORE_API_KEY || "";

        if (!apiKey) {
            console.warn("CORE API: No API key configured");
            return { success: false, error: 'No API key configured' };
        }

        // Use GET endpoint which works better
        const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(title)}&limit=1`;

        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!res.ok) {
            console.warn(`CORE API Error: ${res.status}`);
            return { success: false, status: res.status, error: `HTTP ${res.status}` };
        }

        const data = await res.json();
        const results = data.results;

        if (!results || results.length === 0) return null;

        const hit = results[0];

        return {
            success: true,
            source: 'CORE',
            title: hit.title,
            doi: hit.doi,
            abstract: hit.abstract?.substring(0, 500), // Limit abstract size
            downloadUrl: hit.downloadUrl,
            yearPublished: hit.yearPublished,
            authors: hit.authors?.map((a: any) => a.name) || [],
            raw: hit
        };

    } catch (error) {
        console.error("CORE Helper Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error" };
    }
}
