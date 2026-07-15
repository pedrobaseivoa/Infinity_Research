
// DataCite API Helper
// Docs: https://support.datacite.org/docs/api

interface DataCiteResult {
    title: string;
    doi: string;
    source: 'DataCite';
    [key: string]: any;
}

export async function searchDataCite(title: string, doi?: string): Promise<any | null> {
    // Priority: Search by DOI if available
    if (doi) {
        try {
            const cleanDoi = doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '').replace(/^doi:/, '').trim();
            const url = `https://api.datacite.org/dois/${cleanDoi}`;

            // DataCite requires this header for JSON response
            const res = await fetch(url, {
                headers: {
                    'Accept': 'application/vnd.api+json'
                }
            });

            if (res.ok) {
                const data = await res.json();
                const hit = data.data; // DataCite single item response has 'data' as the item directly
                const attrs = hit.attributes;

                return {
                    success: true,
                    source: 'DataCite',
                    title: attrs.titles?.[0]?.title || 'Unknown',
                    doi: attrs.doi,
                    publicationYear: attrs.publicationYear,
                    publisher: attrs.publisher,
                    type: attrs.types?.resourceTypeGeneral,
                    raw: hit // Full raw data
                };
            } else {
                console.warn(`DataCite DOI Fetch failed: ${res.status}`);
            }
        } catch (e) {
            console.warn("DataCite DOI Search failed:", e);
        }
    }

    if (!title) return null;

    try {
        const url = `https://api.datacite.org/dois?query=${encodeURIComponent(`titles.title:"${title}"`)}&page[size]=1`;

        const res = await fetch(url, {
            headers: { 'Accept': 'application/vnd.api+json' }
        });

        if (!res.ok) return null;

        const data = await res.json();
        // Search returns { data: [...] } array
        if (!data.data || data.data.length === 0) return null;

        const hit = data.data[0];
        const attrs = hit.attributes;

        return {
            success: true,
            source: 'DataCite',
            title: attrs.titles?.[0]?.title || 'Unknown',
            doi: attrs.doi,
            publicationYear: attrs.publicationYear,
            publisher: attrs.publisher,
            type: attrs.types?.resourceTypeGeneral,
            raw: hit // Full raw data
        };

    } catch (error) {
        console.error("DataCite Helper Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error" };
    }
}
