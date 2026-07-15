/**
 * Test ALL input combinations for each API
 * Run with: npx tsx scripts/test-api-combinations.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config({ path: '.env.local' });

// Test data
const TEST = {
    title: "Attention is all you need",
    doi: "10.48550/arXiv.1706.03762",
    author: "Vaswani A"
};

// Also test with a standard DOI (not arXiv)
const TEST2 = {
    title: "Machine Learning in Medicine",
    doi: "10.1056/NEJMra1814259",
    author: "Rajkomar A"
};

interface Result {
    api: string;
    combination: string;
    input: Record<string, string>;
    success: boolean;
    resultTitle?: string;
    time: number;
}

const results: Result[] = [];

// Generic API test functions
async function testAPI(apiName: string, buildQuery: (input: Record<string, string>) => Promise<{ success: boolean, title?: string }>, combo: string, input: Record<string, string>) {
    const start = Date.now();
    try {
        const result = await buildQuery(input);
        results.push({
            api: apiName,
            combination: combo,
            input,
            success: result.success,
            resultTitle: result.title,
            time: Date.now() - start
        });
        return result.success;
    } catch (e) {
        results.push({
            api: apiName,
            combination: combo,
            input,
            success: false,
            time: Date.now() - start
        });
        return false;
    }
}

// API-specific query builders
async function queryPubMed(input: Record<string, string>): Promise<{ success: boolean, title?: string }> {
    const parts: string[] = [];
    if (input.title) parts.push(`"${input.title}"[Title]`);
    if (input.author) parts.push(`${input.author}[Author]`);
    if (input.doi) parts.push(`${input.doi}[DOI]`);

    const query = parts.join(' AND ');
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json`;

    const res = await fetch(url);
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: data.esearchresult?.idlist?.length > 0 };
}

async function queryOpenAlex(input: Record<string, string>): Promise<{ success: boolean, title?: string }> {
    // Build filter
    const filters: string[] = [];
    if (input.doi) {
        const url = `https://api.openalex.org/works/https://doi.org/${input.doi}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'InfinityResearch/1.0' } });
        if (res.ok) {
            const data = await res.json();
            return { success: true, title: data.title };
        }
    }

    // Fallback to search
    let url = `https://api.openalex.org/works?per-page=1`;
    if (input.title) url += `&search=${encodeURIComponent(input.title)}`;
    if (input.author) url += `&filter=author.search:${encodeURIComponent(input.author)}`;

    const res = await fetch(url, { headers: { 'User-Agent': 'InfinityResearch/1.0' } });
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: data.results?.length > 0, title: data.results?.[0]?.title };
}

async function queryCrossRef(input: Record<string, string>): Promise<{ success: boolean, title?: string }> {
    if (input.doi) {
        const url = `https://api.crossref.org/works/${input.doi}`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            return { success: true, title: data.message?.title?.[0] };
        }
    }

    let url = `https://api.crossref.org/works?rows=1`;
    if (input.title) url += `&query.title=${encodeURIComponent(input.title)}`;
    if (input.author) url += `&query.author=${encodeURIComponent(input.author)}`;

    const res = await fetch(url);
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: data.message?.items?.length > 0, title: data.message?.items?.[0]?.title?.[0] };
}

async function querySemanticScholar(input: Record<string, string>): Promise<{ success: boolean, title?: string }> {
    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY || "";
    const headers: Record<string, string> = { "User-Agent": "InfinityResearch/1.0" };
    if (apiKey) headers['x-api-key'] = apiKey;

    if (input.doi) {
        const url = `https://api.semanticscholar.org/graph/v1/paper/${input.doi}?fields=title`;
        const res = await fetch(url, { headers });
        if (res.ok) {
            const data = await res.json();
            return { success: true, title: data.title };
        }
    }

    // Title search
    if (input.title) {
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(input.title)}&limit=1&fields=title`;
        const res = await fetch(url, { headers });
        if (res.ok) {
            const data = await res.json();
            return { success: data.data?.length > 0, title: data.data?.[0]?.title };
        }
    }

    return { success: false };
}

async function queryEuropePMC(input: Record<string, string>): Promise<{ success: boolean, title?: string }> {
    const parts: string[] = [];
    if (input.title) parts.push(`TITLE:"${input.title}"`);
    if (input.author) parts.push(`AUTH:"${input.author}"`);
    if (input.doi) parts.push(`DOI:${input.doi}`);

    const query = parts.join(' AND ');
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=1`;

    const res = await fetch(url);
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: data.resultList?.result?.length > 0, title: data.resultList?.result?.[0]?.title };
}

async function queryDOAJ(input: Record<string, string>): Promise<{ success: boolean, title?: string }> {
    // DOAJ accepts various search terms
    const parts: string[] = [];
    if (input.title) parts.push(input.title);
    if (input.author) parts.push(input.author);
    if (input.doi) parts.push(input.doi);

    const query = parts.join(' ');
    const url = `https://doaj.org/api/v2/search/articles/${encodeURIComponent(query)}`;

    const res = await fetch(url);
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: data.results?.length > 0, title: data.results?.[0]?.bibjson?.title };
}

async function queryUnpaywall(input: Record<string, string>): Promise<{ success: boolean, title?: string }> {
    if (!input.doi) return { success: false }; // DOI required

    const url = `https://api.unpaywall.org/v2/${input.doi}?email=test@infinityresearch.com`;
    const res = await fetch(url);
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: !!data.title, title: data.title };
}

async function queryDataCite(input: Record<string, string>): Promise<{ success: boolean, title?: string }> {
    if (input.doi) {
        const url = `https://api.datacite.org/dois/${encodeURIComponent(input.doi)}`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            return { success: true, title: data.data?.attributes?.titles?.[0]?.title };
        }
    }

    // Search
    const parts: string[] = [];
    if (input.title) parts.push(input.title);
    if (input.author) parts.push(input.author);

    const url = `https://api.datacite.org/dois?query=${encodeURIComponent(parts.join(' '))}&page[size]=1`;
    const res = await fetch(url);
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: data.data?.length > 0, title: data.data?.[0]?.attributes?.titles?.[0]?.title };
}

async function queryORCID(input: Record<string, string>): Promise<{ success: boolean, title?: string }> {
    if (!input.author) return { success: false }; // Author required

    const url = `https://pub.orcid.org/v3.0/search/?q=${encodeURIComponent(input.author)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: data.result?.length > 0 };
}

async function queryCORE(input: Record<string, string>): Promise<{ success: boolean, title?: string }> {
    const apiKey = process.env.CORE_API_KEY;
    if (!apiKey) return { success: false };

    const parts: string[] = [];
    if (input.title) parts.push(input.title);
    if (input.author) parts.push(input.author);
    if (input.doi) parts.push(input.doi);

    const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(parts.join(' '))}&limit=1`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: data.results?.length > 0, title: data.results?.[0]?.title };
}

async function queryArxiv(input: Record<string, string>): Promise<{ success: boolean, title?: string }> {
    const parts: string[] = [];
    if (input.title) parts.push(`ti:"${input.title}"`);
    if (input.author) parts.push(`au:${input.author}`);

    const query = parts.join(' AND ');
    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&max_results=1`;

    const res = await fetch(url);
    if (!res.ok) return { success: false };
    const text = await res.text();
    return { success: text.includes('<entry>') };
}

// Main test
async function runTests() {
    console.log('=== API INPUT COMBINATIONS TEST ===\n');

    const apis = [
        { name: 'pubmed', fn: queryPubMed },
        { name: 'openalex', fn: queryOpenAlex },
        { name: 'crossref', fn: queryCrossRef },
        { name: 'semantic_scholar', fn: querySemanticScholar },
        { name: 'europe_pmc', fn: queryEuropePMC },
        { name: 'doaj', fn: queryDOAJ },
        { name: 'unpaywall', fn: queryUnpaywall },
        { name: 'datacite', fn: queryDataCite },
        { name: 'orcid', fn: queryORCID },
        { name: 'core', fn: queryCORE },
        { name: 'arxiv', fn: queryArxiv },
    ];

    // All possible combinations
    const combinations = [
        { name: 'title', input: { title: TEST2.title } },
        { name: 'doi', input: { doi: TEST2.doi } },
        { name: 'author', input: { author: TEST2.author } },
        { name: 'title+author', input: { title: TEST2.title, author: TEST2.author } },
        { name: 'title+doi', input: { title: TEST2.title, doi: TEST2.doi } },
        { name: 'doi+author', input: { doi: TEST2.doi, author: TEST2.author } },
        { name: 'title+doi+author', input: { title: TEST2.title, doi: TEST2.doi, author: TEST2.author } },
    ];

    console.log(`Test Paper: "${TEST2.title}"`);
    console.log(`DOI: ${TEST2.doi} | Author: ${TEST2.author}\n`);

    // Matrix to store results
    const matrix: Record<string, Record<string, boolean>> = {};

    for (const api of apis) {
        console.log(`Testing ${api.name}...`);
        matrix[api.name] = {};

        for (const combo of combinations) {
            const success = await testAPI(api.name, api.fn, combo.name, combo.input);
            matrix[api.name][combo.name] = success;
        }
    }

    // Print matrix
    console.log('\n\n=== RESULTS MATRIX ===\n');
    const comboCols = ['title', 'doi', 'author', 'title+author', 'title+doi', 'doi+author', 'all'];
    console.log('API'.padEnd(20) + comboCols.map(c => c.padEnd(12)).join(''));
    console.log('-'.repeat(104));

    for (const api of apis) {
        let row = api.name.padEnd(20);
        for (const combo of combinations) {
            const val = matrix[api.name][combo.name] ? 'YES' : '-';
            row += val.padEnd(12);
        }
        console.log(row);
    }

    // Save results
    fs.writeFileSync('scripts/api-combinations-results.json', JSON.stringify({
        testData: TEST2,
        matrix,
        details: results
    }, null, 2));

    console.log('\nFull results: scripts/api-combinations-results.json');
}

runTests().catch(console.error);
