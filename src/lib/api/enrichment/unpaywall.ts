
// Unpaywall API Helper
// Docs: https://unpaywall.org/products/api

export async function searchUnpaywall(doi: string): Promise<any | null> {
    if (!doi) return null;

    try {
        const email = "research@infinity.com";
        const url = `https://api.unpaywall.org/v2/${doi}?email=${email}`;

        const res = await fetch(url);
        if (!res.ok) return null;

        const data = await res.json();

        return {
            success: true,
            source: 'Unpaywall',
            doi: data.doi,
            title: data.title,
            is_oa: data.is_oa,
            oa_status: data.oa_status,
            best_oa_location: data.best_oa_location,
            publisher: data.publisher,
            published_date: data.published_date,
            journal_name: data.journal_name,
            raw: data // Full raw data
        };

    } catch (error) {
        console.error("Unpaywall Helper Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error" };
    }
}
