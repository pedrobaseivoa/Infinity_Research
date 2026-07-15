/**
 * Test script for API enrichment functions
 * Run with: npx ts-node --project tsconfig.json scripts/test-apis.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Test configuration
const TEST_TITLE = "Augmented Reality in Ophthalmology: A Systematic Review";
const TEST_DOI = "10.1016/j.survophthal.2023.01.001";
const TEST_AUTHOR = "Smith J";

// API functions (inline to avoid module resolution issues)
async function searchPubMed(title: string): Promise<any> {
    if (!title) return null;
    try {
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(title)}&retmode=json`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) return null;
        const searchData = await searchRes.json();
        const pmid = searchData.esearchresult?.idlist?.[0];
        if (!pmid) return null;

        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
        const summaryRes = await fetch(summaryUrl);
        if (!summaryRes.ok) return null;
        const summaryData = await summaryRes.json();
        return { success: true, source: 'pubmed', raw: summaryData.result?.[pmid] };
    } catch (e) { return { success: false, error: String(e) }; }
}

async function searchOpenAlex(title: string): Promise<any> {
    if (!title) return null;
    try {
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per-page=1`;
        const res = await fetch(url, { headers: { 'User-Agent': 'InfinityResearch/1.0' } });
        if (!res.ok) return null;
        const data = await res.json();
        return data.results?.[0] ? { success: true, source: 'openalex', raw: data.results[0] } : null;
    } catch (e) { return { success: false, error: String(e) }; }
}

async function searchCrossRef(title: string): Promise<any> {
    if (!title) return null;
    try {
        const url = `https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=1`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data.message?.items?.[0] ? { success: true, source: 'crossref', raw: data.message.items[0] } : null;
    } catch (e) { return { success: false, error: String(e) }; }
}

async function searchSemanticScholar(title: string): Promise<any> {
    if (!title) return null;
    try {
        const fields = "title,year,abstract,citationCount,isOpenAccess,openAccessPdf,externalIds,doi,journal";
        const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY || "";
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=1&fields=${fields}`;
        const headers: Record<string, string> = { "User-Agent": "InfinityResearch/1.0" };
        if (apiKey) headers['x-api-key'] = apiKey;

        const res = await fetch(url, { headers });
        if (!res.ok) return { success: false, status: res.status, error: `HTTP ${res.status}` };
        const data = await res.json();
        return data.data?.[0] ? { success: true, source: 'semantic_scholar', raw: data.data[0] } : null;
    } catch (e) { return { success: false, error: String(e) }; }
}

async function searchEuropePMC(title: string): Promise<any> {
    if (!title) return null;
    try {
        const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(title)}&format=json&pageSize=1`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data.resultList?.result?.[0] ? { success: true, source: 'europe_pmc', raw: data.resultList.result[0] } : null;
    } catch (e) { return { success: false, error: String(e) }; }
}

async function searchArxiv(title: string): Promise<any> {
    if (!title) return null;
    try {
        const url = `https://export.arxiv.org/api/query?search_query=ti:${encodeURIComponent(title)}&max_results=1`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const raw = await res.text();
        return raw.includes('<entry>') ? { success: true, source: 'arxiv', raw: raw.substring(0, 2000) + '...' } : null;
    } catch (e) { return { success: false, error: String(e) }; }
}

async function searchDataCite(title: string, doi: string): Promise<any> {
    if (!title && !doi) return null;
    try {
        const url = `https://api.datacite.org/dois?query=${encodeURIComponent(doi || title)}&page[size]=1`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data.data?.[0] ? { success: true, source: 'datacite', raw: data.data[0] } : null;
    } catch (e) { return { success: false, error: String(e) }; }
}

async function searchUnpaywall(doi: string): Promise<any> {
    if (!doi) return null;
    try {
        const url = `https://api.unpaywall.org/v2/${doi}?email=contact@infinityresearch.com`;
        const res = await fetch(url);
        if (!res.ok) return null;
        return { success: true, source: 'unpaywall', raw: await res.json() };
    } catch (e) { return { success: false, error: String(e) }; }
}

async function searchDOAJ(doi: string): Promise<any> {
    if (!doi) return null;
    try {
        const url = `https://doaj.org/api/search/articles/doi:${doi}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data.results?.[0] ? { success: true, source: 'doaj', raw: data.results[0] } : null;
    } catch (e) { return { success: false, error: String(e) }; }
}

async function searchORCID(authorName: string): Promise<any> {
    if (!authorName) return null;
    try {
        const url = `https://pub.orcid.org/v3.0/search/?q=${encodeURIComponent(authorName)}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) return null;
        const raw = await res.json();
        return raw.result?.[0] ? { success: true, source: 'orcid', raw: raw } : null;
    } catch (e) { return { success: false, error: String(e) }; }
}

async function searchCORE(title: string): Promise<any> {
    const apiKey = process.env.CORE_API_KEY;
    if (!title || !apiKey) return { success: false, error: 'No API key or title' };
    try {
        const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(title)}&limit=1`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
        if (!res.ok) return { success: false, status: res.status, error: `HTTP ${res.status}` };
        const data = await res.json();
        return data.results?.[0] ? { success: true, source: 'core', raw: data.results[0] } : null;
    } catch (e) { return { success: false, error: String(e) }; }
}

// Helper to calculate size
function getSize(obj: any): string {
    const bytes = Buffer.byteLength(JSON.stringify(obj || {}), 'utf8');
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} bytes`;
}

// Main test function
async function runTests() {
    console.log('🚀 Testing API Enrichment Functions\n');
    console.log(`📄 Test Title: "${TEST_TITLE}"`);
    console.log(`🔗 Test DOI: ${TEST_DOI}`);
    console.log(`👤 Test Author: ${TEST_AUTHOR}\n`);
    console.log('━'.repeat(60) + '\n');

    const results: Record<string, any> = {};
    const summary: { api: string; success: boolean; size: string; time: number }[] = [];

    const apis = [
        { name: 'pubmed', fn: () => searchPubMed(TEST_TITLE) },
        { name: 'openalex', fn: () => searchOpenAlex(TEST_TITLE) },
        { name: 'crossref', fn: () => searchCrossRef(TEST_TITLE) },
        { name: 'semantic_scholar', fn: () => searchSemanticScholar(TEST_TITLE) },
        { name: 'europe_pmc', fn: () => searchEuropePMC(TEST_TITLE) },
        { name: 'arxiv', fn: () => searchArxiv(TEST_TITLE) },
        { name: 'datacite', fn: () => searchDataCite(TEST_TITLE, TEST_DOI) },
        { name: 'unpaywall', fn: () => searchUnpaywall(TEST_DOI) },
        { name: 'doaj', fn: () => searchDOAJ(TEST_DOI) },
        { name: 'orcid', fn: () => searchORCID(TEST_AUTHOR) },
        { name: 'core', fn: () => searchCORE(TEST_TITLE) },
    ];

    for (const api of apis) {
        const start = Date.now();
        console.log(`⏳ Testing ${api.name}...`);

        try {
            const result = await api.fn();
            const elapsed = Date.now() - start;
            const size = getSize(result);
            const success = result?.success === true;

            results[api.name] = result;
            summary.push({ api: api.name, success, size, time: elapsed });

            if (success) {
                console.log(`   ✅ ${api.name}: ${size} (${elapsed}ms)`);
            } else {
                console.log(`   ❌ ${api.name}: ${result?.error || 'No data'} (${elapsed}ms)`);
            }
        } catch (e) {
            const elapsed = Date.now() - start;
            console.log(`   ❌ ${api.name}: ERROR - ${e}`);
            results[api.name] = { success: false, error: String(e) };
            summary.push({ api: api.name, success: false, size: '0', time: elapsed });
        }
    }

    // Save results
    const outputPath = path.join(__dirname, 'test-apis-output.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n📁 Full results saved to: ${outputPath}`);

    // Print summary
    console.log('\n' + '━'.repeat(60));
    console.log('\n📊 SUMMARY:\n');
    console.log('API'.padEnd(20) + 'Status'.padEnd(10) + 'Size'.padEnd(15) + 'Time');
    console.log('-'.repeat(55));

    let totalSize = 0;
    for (const s of summary) {
        const status = s.success ? '✅' : '❌';
        console.log(`${s.api.padEnd(20)}${status.padEnd(10)}${s.size.padEnd(15)}${s.time}ms`);
        if (s.success) {
            const bytes = Buffer.byteLength(JSON.stringify(results[s.api] || {}), 'utf8');
            totalSize += bytes;
        }
    }

    console.log('-'.repeat(55));
    console.log(`TOTAL: ${summary.filter(s => s.success).length}/${summary.length} APIs succeeded`);
    console.log(`TOTAL SIZE: ${(totalSize / 1024).toFixed(2)} KB`);
}

runTests().catch(console.error);
