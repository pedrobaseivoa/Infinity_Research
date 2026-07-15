
// ORCID API Helper
// Docs: https://pub.orcid.org/v3.0/

export async function searchORCID(authorName: string): Promise<any | null> {
    if (!authorName) return null;

    try {
        const url = `https://pub.orcid.org/v3.0/search/?q=${encodeURIComponent(authorName)}&rows=1`;

        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) return null;

        const data = await res.json();
        const result = data.result;

        if (!result || result.length === 0) return null;

        const entry = result[0];
        const orcidId = entry['orcid-identifier']?.path;

        return {
            success: true,
            source: 'ORCID',
            orcidIdentifier: orcidId,
            givenName: '',
            familyName: '',
            raw: entry // Full raw data
        };

    } catch (error) {
        console.error("ORCID Helper Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error" };
    }
}
