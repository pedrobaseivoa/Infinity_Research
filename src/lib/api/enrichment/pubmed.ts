
// PubMed API Helper
// Docs: https://www.ncbi.nlm.nih.gov/books/NBK25501/

interface PubMedResult {
    title: string;
    pmid: string;
    doi?: string;
    pubDate?: string;
    source: 'PubMed';
    [key: string]: any; // Allow other props
}

export async function searchPubMed(title: string): Promise<any | null> {
    if (!title) return null;

    try {
        // 1. Search for ID
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(title)}&retmode=json`;
        const searchRes = await fetch(searchUrl);

        if (!searchRes.ok) return null;

        const searchData = await searchRes.json();
        const idList = searchData.esearchresult?.idlist;

        if (!idList || idList.length === 0) return null;

        const pmid = idList[0];

        // 2. Fetch Details
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
        const summaryRes = await fetch(summaryUrl);

        if (!summaryRes.ok) return null;

        const summaryData = await summaryRes.json();
        const result = summaryData.result?.[pmid];

        if (!result) return null;

        return {
            success: true,
            source: 'PubMed',
            title: result.title,
            pmid: pmid,
            doi: result.elocationid?.replace('doi: ', ''),
            pubDate: result.pubdate,
            raw: result // Full raw data
        };

    } catch (error) {
        console.error("PubMed Helper Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error" };
    }
}
