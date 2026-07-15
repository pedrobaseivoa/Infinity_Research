/**
 * Test which input fields each API accepts
 * Run with: npx tsx scripts/test-api-inputs.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config({ path: '.env.local' });

// Test data - a well-known paper
const TEST_DATA = {
    title: "Attention is all you need",
    doi: "10.48550/arXiv.1706.03762",
    author: "Vaswani A",
    year: 2017
};

interface TestResult {
    api: string;
    inputType: string;
    input: string;
    success: boolean;
    foundTitle?: string;
    time: number;
}

const results: TestResult[] = [];

// Helper function for each API
async function testPubMed(input: string, inputType: string) {
    const start = Date.now();
    try {
        const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(input)}&retmode=json`;
        const res = await fetch(url);
        if (!res.ok) return { success: false, time: Date.now() - start };
        const data = await res.json();
        const ids = data.esearchresult?.idlist;
        return { success: ids && ids.length > 0, time: Date.now() - start };
    } catch { return { success: false, time: Date.now() - start }; }
}

async function testOpenAlex(input: string, inputType: string) {
    const start = Date.now();
    try {
        let url: string;
        if (inputType === 'doi') {
            url = `https://api.openalex.org/works/https://doi.org/${input}`;
        } else {
            url = `https://api.openalex.org/works?search=${encodeURIComponent(input)}&per-page=1`;
        }
        const res = await fetch(url, { headers: { 'User-Agent': 'InfinityResearch/1.0' } });
        if (!res.ok) return { success: false, time: Date.now() - start };
        const data = await res.json();
        const hasResult = inputType === 'doi' ? !!data.title : data.results?.length > 0;
        return {
            success: hasResult,
            foundTitle: inputType === 'doi' ? data.title : data.results?.[0]?.title,
            time: Date.now() - start
        };
    } catch { return { success: false, time: Date.now() - start }; }
}

async function testCrossRef(input: string, inputType: string) {
    const start = Date.now();
    try {
        let url: string;
        if (inputType === 'doi') {
            url = `https://api.crossref.org/works/${input}`;
        } else {
            url = `https://api.crossref.org/works?query.title=${encodeURIComponent(input)}&rows=1`;
        }
        const res = await fetch(url);
        if (!res.ok) return { success: false, time: Date.now() - start };
        const data = await res.json();
        const hasResult = inputType === 'doi' ? !!data.message?.title : data.message?.items?.length > 0;
        return { success: hasResult, time: Date.now() - start };
    } catch { return { success: false, time: Date.now() - start }; }
}

async function testSemanticScholar(input: string, inputType: string) {
    const start = Date.now();
    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY || "";
    const headers: Record<string, string> = { "User-Agent": "InfinityResearch/1.0" };
    if (apiKey) headers['x-api-key'] = apiKey;

    try {
        let url: string;
        if (inputType === 'doi') {
            url = `https://api.semanticscholar.org/graph/v1/paper/${input}?fields=title`;
        } else {
            url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(input)}&limit=1&fields=title`;
        }
        const res = await fetch(url, { headers });
        if (!res.ok) return { success: false, time: Date.now() - start };
        const data = await res.json();
        const hasResult = inputType === 'doi' ? !!data.title : data.data?.length > 0;
        return { success: hasResult, time: Date.now() - start };
    } catch { return { success: false, time: Date.now() - start }; }
}

async function testEuropePMC(input: string, inputType: string) {
    const start = Date.now();
    try {
        let query = input;
        if (inputType === 'doi') query = `DOI:${input}`;
        if (inputType === 'author') query = `AUTH:"${input}"`;

        const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=1`;
        const res = await fetch(url);
        if (!res.ok) return { success: false, time: Date.now() - start };
        const data = await res.json();
        return { success: data.resultList?.result?.length > 0, time: Date.now() - start };
    } catch { return { success: false, time: Date.now() - start }; }
}

async function testArxiv(input: string, inputType: string) {
    const start = Date.now();
    try {
        let query: string;
        if (inputType === 'title') query = `ti:${input}`;
        else if (inputType === 'author') query = `au:${input}`;
        else if (inputType === 'doi') {
            // ArXiv uses arXiv IDs, not DOIs - extract if possible
            const arxivMatch = input.match(/arXiv[:\.](\d+\.\d+)/i);
            if (arxivMatch) query = `id:${arxivMatch[1]}`;
            else return { success: false, time: Date.now() - start };
        } else query = input;

        const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&max_results=1`;
        const res = await fetch(url);
        if (!res.ok) return { success: false, time: Date.now() - start };
        const text = await res.text();
        return { success: text.includes('<entry>'), time: Date.now() - start };
    } catch { return { success: false, time: Date.now() - start }; }
}

async function testDataCite(input: string, inputType: string) {
    const start = Date.now();
    try {
        let url: string;
        if (inputType === 'doi') {
            url = `https://api.datacite.org/dois/${encodeURIComponent(input)}`;
        } else {
            url = `https://api.datacite.org/dois?query=${encodeURIComponent(input)}&page[size]=1`;
        }
        const res = await fetch(url);
        if (!res.ok) return { success: false, time: Date.now() - start };
        const data = await res.json();
        const hasResult = inputType === 'doi' ? !!data.data?.attributes?.titles : data.data?.length > 0;
        return { success: hasResult, time: Date.now() - start };
    } catch { return { success: false, time: Date.now() - start }; }
}

async function testUnpaywall(input: string, inputType: string) {
    const start = Date.now();
    if (inputType !== 'doi') return { success: false, time: 0 }; // Only works with DOI

    try {
        const url = `https://api.unpaywall.org/v2/${input}?email=test@infinityresearch.com`;
        const res = await fetch(url);
        if (!res.ok) return { success: false, time: Date.now() - start };
        const data = await res.json();
        return { success: !!data.title, time: Date.now() - start };
    } catch { return { success: false, time: Date.now() - start }; }
}

async function testDOAJ(input: string, inputType: string) {
    const start = Date.now();
    try {
        const url = `https://doaj.org/api/v2/search/articles/${encodeURIComponent(input)}`;
        const res = await fetch(url);
        if (!res.ok) return { success: false, time: Date.now() - start };
        const data = await res.json();
        return { success: data.results?.length > 0, time: Date.now() - start };
    } catch { return { success: false, time: Date.now() - start }; }
}

async function testORCID(input: string, inputType: string) {
    const start = Date.now();
    if (inputType !== 'author') return { success: false, time: 0 }; // Only works with author

    try {
        const url = `https://pub.orcid.org/v3.0/search/?q=${encodeURIComponent(input)}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) return { success: false, time: Date.now() - start };
        const data = await res.json();
        return { success: data.result?.length > 0, time: Date.now() - start };
    } catch { return { success: false, time: Date.now() - start }; }
}

async function testCORE(input: string, inputType: string) {
    const start = Date.now();
    const apiKey = process.env.CORE_API_KEY;
    if (!apiKey) return { success: false, time: 0 };

    try {
        const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(input)}&limit=1`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
        if (!res.ok) return { success: false, time: Date.now() - start };
        const data = await res.json();
        return { success: data.results?.length > 0, time: Date.now() - start };
    } catch { return { success: false, time: Date.now() - start }; }
}

// Main test function
async function runInputTests() {
    console.log('=== API INPUT COMPATIBILITY TEST ===\n');
    console.log('Testing which input types each API accepts...\n');
    console.log(`Test Title: "${TEST_DATA.title}"`);
    console.log(`Test DOI: ${TEST_DATA.doi}`);
    console.log(`Test Author: ${TEST_DATA.author}\n`);

    const apis = [
        { name: 'pubmed', fn: testPubMed },
        { name: 'openalex', fn: testOpenAlex },
        { name: 'crossref', fn: testCrossRef },
        { name: 'semantic_scholar', fn: testSemanticScholar },
        { name: 'europe_pmc', fn: testEuropePMC },
        { name: 'arxiv', fn: testArxiv },
        { name: 'datacite', fn: testDataCite },
        { name: 'unpaywall', fn: testUnpaywall },
        { name: 'doaj', fn: testDOAJ },
        { name: 'orcid', fn: testORCID },
        { name: 'core', fn: testCORE },
    ];

    const inputTypes = [
        { type: 'title', value: TEST_DATA.title },
        { type: 'doi', value: TEST_DATA.doi },
        { type: 'author', value: TEST_DATA.author },
    ];

    const matrix: Record<string, Record<string, boolean>> = {};

    for (const api of apis) {
        console.log(`Testing ${api.name}...`);
        matrix[api.name] = {};

        for (const input of inputTypes) {
            const result = await api.fn(input.value, input.type);
            matrix[api.name][input.type] = result.success;

            results.push({
                api: api.name,
                inputType: input.type,
                input: input.value,
                success: result.success,
                time: result.time
            });
        }
    }

    // Generate summary table
    console.log('\n\n=== COMPATIBILITY MATRIX ===\n');
    console.log('API'.padEnd(20) + 'Title'.padEnd(10) + 'DOI'.padEnd(10) + 'Author'.padEnd(10));
    console.log('-'.repeat(50));

    for (const api of apis) {
        const t = matrix[api.name].title ? 'YES' : 'no';
        const d = matrix[api.name].doi ? 'YES' : 'no';
        const a = matrix[api.name].author ? 'YES' : 'no';
        console.log(`${api.name.padEnd(20)}${t.padEnd(10)}${d.padEnd(10)}${a.padEnd(10)}`);
    }

    // Save detailed results
    const output = {
        testData: TEST_DATA,
        matrix,
        details: results
    };

    fs.writeFileSync('scripts/api-input-compatibility.json', JSON.stringify(output, null, 2));
    console.log('\nDetailed results: scripts/api-input-compatibility.json');
}

runInputTests().catch(console.error);
