
// Europe PMC API Helper
// Docs: https://europepmc.org/RestfulWebService

export async function searchEuropePMC(title: string): Promise<any | null> {
    if (!title) return null;

    try {
        const query = `TITLE:"${title.replace(/"/g, '')}"`;
        const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=1&resultType=lite`;

        const res = await fetch(url);
        if (!res.ok) return null;

        const data = await res.json();
        const resultList = data.resultList?.result;

        if (!resultList || resultList.length === 0) return null;

        const hit = resultList[0];

        return {
            success: true,
            source: 'Europe PMC',
            title: hit.title,
            doi: hit.doi,
            pmid: hit.pmid,
            pmcid: hit.pmcid,
            authorString: hit.authorString,
            journalTitle: hit.journalTitle,
            pubYear: hit.pubYear,
            raw: hit // Full raw data
        };

    } catch (error) {
        console.error("Europe PMC Helper Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error" };
    }
}
