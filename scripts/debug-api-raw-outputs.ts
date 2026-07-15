
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// ==============================================================================
// COPIED FUNCTIONS FROM src/app/api/process-article/route.ts (Production Logic)
// ==============================================================================

async function searchPubMed(title: string, doi?: string): Promise<any> {
    if (!title && !doi) return null;
    const debug: any = { input_title: title, input_doi: doi, attempts: [] };

    try {
        if (doi) {
            const doiUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(doi)}[DOI]&retmode=json`;
            const doiRes = await fetch(doiUrl);
            if (doiRes.ok) {
                const doiData = await doiRes.json();
                const pmidFromDoi = doiData.esearchresult?.idlist?.[0];
                if (pmidFromDoi) {
                    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmidFromDoi}&retmode=json`;
                    const summaryRes = await fetch(summaryUrl);
                    if (summaryRes.ok) {
                        const summaryData = await summaryRes.json();
                        const raw = summaryData.result?.[pmidFromDoi];
                        if (raw) return { success: true, source: 'pubmed', raw, _debug: debug };
                    }
                }
            }
        }
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(title)}&retmode=json`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) return { success: false, error: `http error ${searchRes.status}`, _debug: debug };
        const searchData = await searchRes.json();
        const pmid = searchData.esearchresult?.idlist?.[0];
        if (!pmid) return { success: false, error: 'No match found', _debug: debug };
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
        const summaryRes = await fetch(summaryUrl);
        if (!summaryRes.ok) return { success: false, error: 'Summary fetch failed', _debug: debug };
        const summaryData = await summaryRes.json();
        const raw = summaryData.result?.[pmid];
        if (!raw) return { success: false, error: 'No raw data', _debug: debug };
        return { success: true, source: 'pubmed', raw, _debug: debug };
    } catch (e: any) {
        return { success: false, error: e.message, _debug: debug };
    }
}

async function searchOpenAlex(title: string, doi?: string): Promise<any> {
    if (!title && !doi) return null;
    const debug: any = { input_title: title, input_doi: doi, attempts: [] };
    const headers: Record<string, string> = { 'User-Agent': 'InfinityResearch/1.0' };
    if (process.env.OPENALEX_API_KEY) headers['api_key'] = process.env.OPENALEX_API_KEY;

    try {
        if (doi) {
            const doiUrl = `https://api.openalex.org/works/https://doi.org/${doi}`;
            const doiRes = await fetch(doiUrl, { headers });
            if (doiRes.ok) {
                const raw = await doiRes.json();
                if (raw.title) return { success: true, source: 'openalex', raw, _debug: debug };
            }
        }
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per-page=1`;
        const res = await fetch(url, { headers });
        if (!res.ok) return { success: false, error: `http error ${res.status}`, _debug: debug };
        const data = await res.json();
        const raw = data.results?.[0];
        if (!raw) return { success: false, error: 'No match found', _debug: debug };
        return { success: true, source: 'openalex', raw, _debug: debug };
    } catch (e: any) {
        return { success: false, error: e.message, _debug: debug };
    }
}

async function searchCrossRef(title: string, doi?: string): Promise<any> {
    if (!title && !doi) return null;
    const debug: any = { input_title: title, input_doi: doi, attempts: [] };
    try {
        if (doi) {
            const doiUrl = `https://api.crossref.org/works/${doi}`;
            const doiRes = await fetch(doiUrl);
            if (doiRes.ok) {
                const data = await doiRes.json();
                if (data.message?.title) return { success: true, source: 'crossref', raw: data.message, _debug: debug };
            }
        }
        const url = `https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=1`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const raw = data.message?.items?.[0];
        if (!raw) return { success: false, error: 'No match found', _debug: debug };
        return { success: true, source: 'crossref', raw, _debug: debug };
    } catch (e: any) {
        return { success: false, error: e.message, _debug: debug };
    }
}

async function searchSemanticScholar(title: string, doi?: string): Promise<any> {
    if (!title && !doi) return null;
    const debug: any = { input_title: title, input_doi: doi, attempts: [] };
    try {
        const headers = { 'x-api-key': process.env.SEMANTIC_SCHOLAR_API_KEY || '', 'User-Agent': 'InfinityResearch/1.0' };
        if (doi) {
            // FIXED URL: uses externalIds instead of doi
            const doiUrl = `https://api.semanticscholar.org/graph/v1/paper/${doi}?fields=title,externalIds,citationCount,authors,year,abstract`;
            const doiRes = await fetch(doiUrl, { headers });
            if (doiRes.ok) {
                const raw = await doiRes.json();
                if (raw.title) return { success: true, source: 'semantic_scholar', raw, _debug: debug };
            }
        }
        // FIXED URL: uses externalIds instead of doi
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=1&fields=title,externalIds,citationCount,authors,year,abstract`;
        const res = await fetch(url, { headers });
        if (!res.ok) return { success: false, error: `http error ${res.status}`, _debug: debug };
        const data = await res.json();
        const raw = data.data?.[0];
        if (!raw) return { success: false, error: 'No match found', _debug: debug };
        return { success: true, source: 'semantic_scholar', raw, _debug: debug };
    } catch (e: any) {
        return { success: false, error: e.message, _debug: debug };
    }
}

async function searchEuropePMC(title: string, doi?: string): Promise<any> {
    if (!title && !doi) return null;
    const debug: any = { input_title: title, input_doi: doi, attempts: [] };
    try {
        if (doi) {
            const doiUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:${doi}&format=json&pageSize=1`;
            const doiRes = await fetch(doiUrl);
            if (doiRes.ok) {
                const data = await doiRes.json();
                const raw = data.resultList?.result?.[0];
                if (raw) return { success: true, source: 'europe_pmc', raw, _debug: debug };
            }
        }
        const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(title)}&format=json&pageSize=1`;
        const res = await fetch(url);
        if (!res.ok) return { success: false, error: `http error ${res.status}`, _debug: debug };
        const data = await res.json();
        const raw = data.resultList?.result?.[0];
        if (!raw) return { success: false, error: 'No match found', _debug: debug };
        return { success: true, source: 'europe_pmc', raw, _debug: debug };
    } catch (e: any) {
        return { success: false, error: e.message, _debug: debug };
    }
}

async function searchArxiv(title: string, doi?: string): Promise<any> {
    // Simplified for brevity, same logic
    return { success: true, source: 'arxiv', raw: '<xml>MOCKED FOR TEXT ANALYSIS</xml>' }; // ArXiv returns XML text, effectively treated as string
}

async function searchDataCite(title: string, doi?: string): Promise<any> {
    if (!title && !doi) return null;
    try {
        const query = doi || title;
        const url = `https://api.datacite.org/dois?query=${encodeURIComponent(query)}&page[size]=1`;
        const res = await fetch(url);
        if (!res.ok) return { success: false, error: `http error ${res.status}` };
        const data = await res.json();
        const raw = data.data?.[0];
        if (!raw) return { success: false, error: 'No match found' };
        return { success: true, source: 'datacite', raw };
    } catch (e: any) { return { success: false, error: e.message }; }
}

async function searchUnpaywall(title: string, doi?: string): Promise<any> {
    if (!title && !doi) return null;
    const debug: any = { input_title: title, input_doi: doi };
    try {
        if (doi) {
            const doiUrl = `https://api.unpaywall.org/v2/${doi}?email=contact@infinityresearch.com`;
            const doiRes = await fetch(doiUrl);
            if (doiRes.ok) {
                const raw = await doiRes.json();
                if (raw.doi) return { success: true, source: 'unpaywall', raw, _debug: debug };
            }
        }
        // FIXED: Fallback implemented
        const url = `https://api.unpaywall.org/v2/search?query=${encodeURIComponent(title)}&email=contact@infinityresearch.com`;
        const res = await fetch(url);
        if (!res.ok) return { success: false, error: `http error ${res.status}`, _debug: debug };
        const data = await res.json();
        const raw = data.results?.[0]?.response;
        if (!raw) return { success: false, error: 'No match found', _debug: debug };
        return { success: true, source: 'unpaywall', raw, _debug: debug };
    } catch (e: any) { return { success: false, error: e.message }; }
}

async function searchDOAJ(title: string, doi?: string): Promise<any> {
    const query = title || doi || '';
    const url = `https://doaj.org/api/v2/search/articles/${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return { success: false };
    const data = await res.json();
    const raw = data.results?.[0];
    if (!raw) return { success: false };
    return { success: true, source: 'doaj', raw };
}

async function searchORCID(authorName: string): Promise<any> {
    if (!authorName) return null;
    const url = `https://pub.orcid.org/v3.0/search/?q=${encodeURIComponent(authorName)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return { success: false };
    const raw = await res.json();
    if (!raw.result?.[0]) return { success: false };
    return { success: true, source: 'orcid', raw };
}

async function searchCore(title: string, doi?: string): Promise<any> {
    if (!title || !process.env.CORE_API_KEY) return null;
    const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(title)}&limit=1`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${process.env.CORE_API_KEY}` } });
    if (!res.ok) return { success: false };
    const data = await res.json();
    const raw = data.results?.[0];
    if (!raw) return { success: false };
    return { success: true, source: 'core', raw };
}

// ==============================================================================
// ANALYSIS HELPER
// ==============================================================================

function analyzeRaw(source: string, raw: any) {
    console.log(`\n\n=== SOURCE: ${source.toUpperCase()} ===`);
    if (!raw) {
        console.log('No data.');
        return;
    }

    const keys = Object.keys(raw);
    console.log(`Top-level keys (${keys.length}):`, keys.join(', '));

    // Check key fields size
    const suspiciousFields = [];
    JSON.stringify(raw, (key, value) => {
        if (typeof value === 'string' && value.length > 500) {
            suspiciousFields.push(`${key} (${value.length} chars)`);
        }
        return value;
    });

    if (suspiciousFields.length > 0) {
        console.log('⚠️  LARGE TEXT FIELDS FOUND (Candidates for filtering):');
        suspiciousFields.forEach(f => console.log('   - ' + f));
    } else {
        console.log('✅ No excessively large text fields found (>500 chars).');
    }
}

// ==============================================================================
// MAIN RUNNER
// ==============================================================================
async function run() {
    const title = "Attention Is All You Need";
    const doi = "10.48550/arXiv.1706.03762"; // Using real DOI for best results
    const author = "Ashish Vaswani";

    console.log('Fetching all APIs...');
    const results = await Promise.all([
        searchPubMed(title, doi),
        searchOpenAlex(title, doi),
        searchCrossRef(title, doi),
        searchSemanticScholar(title, doi),
        searchEuropePMC(title, doi),
        searchArxiv(title, doi),
        searchDataCite(title, doi),
        searchUnpaywall(title, doi),
        searchDOAJ(title, doi),
        searchORCID(author),
        searchCore(title, doi)
    ]);

    results.forEach(res => {
        if (res && res.success) {
            analyzeRaw(res.source, res.raw);
        } else {
            console.log(`\n\n=== SOURCE: ${res?.source || 'UNKNOWN'} ===`);
            console.log('Failed:', res?.error);
        }
    });
}

run();
