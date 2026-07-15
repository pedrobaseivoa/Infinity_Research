/**
 * Test script to verify API keys are working
 * Run with: npx tsx scripts/test-api-keys.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config({ path: '.env.local' });

const TEST_TITLE = "Augmented Reality in Ophthalmology";
const TEST_DOI = "10.1016/j.survophthal.2022.02.001";

interface TestResult {
    api: string;
    keyConfigured: boolean;
    keyPrefix?: string;
    status: number;
    success: boolean;
    message: string;
    data?: any;
}

const results: TestResult[] = [];

async function testSemanticScholar() {
    console.log('Testing Semantic Scholar...');

    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;

    // Test Paper by DOI - more reliable
    const url = `https://api.semanticscholar.org/graph/v1/paper/${TEST_DOI}?fields=title,year,citationCount`;

    try {
        const headers: Record<string, string> = { 'User-Agent': 'InfinityResearch/1.0' };
        if (apiKey) headers['x-api-key'] = apiKey;

        const res = await fetch(url, { headers });
        const data = res.ok ? await res.json() : await res.text();

        results.push({
            api: 'semantic_scholar',
            keyConfigured: !!apiKey,
            keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : undefined,
            status: res.status,
            success: res.ok,
            message: res.ok ? 'SUCCESS' : String(data).substring(0, 100),
            data: res.ok ? { title: data.title, year: data.year, citations: data.citationCount } : undefined
        });
    } catch (e) {
        results.push({
            api: 'semantic_scholar',
            keyConfigured: !!apiKey,
            status: 0,
            success: false,
            message: String(e)
        });
    }
}

async function testCoreAPI() {
    console.log('Testing CORE...');

    const apiKey = process.env.CORE_API_KEY;

    if (!apiKey) {
        results.push({
            api: 'core',
            keyConfigured: false,
            status: 0,
            success: false,
            message: 'No API key configured'
        });
        return;
    }

    const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(TEST_TITLE)}&limit=1`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = res.ok ? await res.json() : await res.text();

        results.push({
            api: 'core',
            keyConfigured: true,
            keyPrefix: apiKey.substring(0, 10) + '...',
            status: res.status,
            success: res.ok,
            message: res.ok ? 'SUCCESS' : String(data).substring(0, 100),
            data: res.ok ? { totalHits: data.totalHits, firstTitle: data.results?.[0]?.title?.substring(0, 50) } : undefined
        });
    } catch (e) {
        results.push({
            api: 'core',
            keyConfigured: true,
            status: 0,
            success: false,
            message: String(e)
        });
    }
}

async function testOpenAlexAPI() {
    console.log('Testing OpenAlex...');

    const apiKey = process.env.OPENALEX_API_KEY;
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(TEST_TITLE)}&per-page=1`;

    try {
        const headers: Record<string, string> = {
            'User-Agent': 'InfinityResearch/1.0 (mailto:contact@infinityresearch.com)'
        };
        if (apiKey) headers['api_key'] = apiKey;

        const res = await fetch(url, { headers });
        const data = res.ok ? await res.json() : await res.text();

        results.push({
            api: 'openalex',
            keyConfigured: !!apiKey,
            keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'Using polite pool',
            status: res.status,
            success: res.ok,
            message: res.ok ? 'SUCCESS' : String(data).substring(0, 100),
            data: res.ok ? {
                count: data.meta?.count,
                firstTitle: data.results?.[0]?.title?.substring(0, 50),
                citations: data.results?.[0]?.cited_by_count
            } : undefined
        });
    } catch (e) {
        results.push({
            api: 'openalex',
            keyConfigured: !!apiKey,
            status: 0,
            success: false,
            message: String(e)
        });
    }
}

async function main() {
    console.log('API KEY VERIFICATION TEST\n');

    await testSemanticScholar();
    await testCoreAPI();
    await testOpenAlexAPI();

    // Save results as JSON
    fs.writeFileSync('scripts/api-keys-test-results.json', JSON.stringify(results, null, 2));

    // Print summary
    console.log('\n=== RESULTS ===\n');
    for (const r of results) {
        console.log(`${r.api}: ${r.success ? 'OK' : 'FAILED'} (status ${r.status})`);
        if (r.keyConfigured) console.log(`  Key: ${r.keyPrefix}`);
        if (!r.success) console.log(`  Error: ${r.message}`);
        if (r.data) console.log(`  Data: ${JSON.stringify(r.data)}`);
    }

    console.log('\nFull results saved to: scripts/api-keys-test-results.json');
}

main().catch(console.error);
