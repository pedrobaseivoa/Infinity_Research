/**
 * Comprehensive test with multiple papers to test all APIs work
 * Run with: npx tsx scripts/test-all-apis-comprehensive.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

// Import original functions
import { searchPubMed } from '../src/lib/api/enrichment/pubmed';
import { searchOpenAlex } from '../src/lib/api/enrichment/openalex';
import { searchCrossRef } from '../src/lib/api/enrichment/crossref';
import { searchSemanticScholar } from '../src/lib/api/enrichment/semantic_scholar';
import { searchEuropePMC } from '../src/lib/api/enrichment/europe_pmc';
import { searchArxiv } from '../src/lib/api/enrichment/arxiv';
import { searchDataCite } from '../src/lib/api/enrichment/datacite';
import { searchUnpaywall } from '../src/lib/api/enrichment/unpaywall';
import { searchDOAJ } from '../src/lib/api/enrichment/doaj';
import { searchORCID } from '../src/lib/api/enrichment/orcid';
import { searchCore } from '../src/lib/api/enrichment/core';

// Test cases designed to hit different databases
const TEST_CASES = [
    {
        name: 'Medical/Clinical (for PubMed, Europe PMC)',
        title: 'SARS-CoV-2 vaccination in patients with inflammatory bowel disease',
        doi: '10.1016/S2468-1253(21)00024-2',
        author: 'Siegel CA'
    },
    {
        name: 'Computer Science (for arXiv, Semantic Scholar)',
        title: 'Attention is all you need',
        doi: '10.48550/arXiv.1706.03762',
        author: 'Vaswani A'
    },
    {
        name: 'Open Access Journal (for DOAJ, Unpaywall)',
        title: 'Machine learning in medicine',
        doi: '10.1056/NEJMra1814259',
        author: 'Rajkomar A'
    },
    {
        name: 'Dataset (for DataCite)',
        title: 'COVID-19 Open Research Dataset',
        doi: '10.5281/zenodo.3715505',
        author: 'Wang LL'
    }
];

interface ApiTestResult {
    api: string;
    testCase: string;
    success: boolean;
    title?: string;
    time: number;
    error?: string;
}

const allResults: ApiTestResult[] = [];
const apiSuccessCount: Record<string, number> = {};

async function testApi(apiName: string, fn: () => Promise<any>, testCaseName: string) {
    const start = Date.now();
    try {
        const result = await fn();
        const elapsed = Date.now() - start;
        const success = result?.success === true;

        if (success) {
            apiSuccessCount[apiName] = (apiSuccessCount[apiName] || 0) + 1;
        }

        allResults.push({
            api: apiName,
            testCase: testCaseName,
            success,
            title: success ? result.title?.substring(0, 40) : undefined,
            time: elapsed,
            error: !success ? (result?.error || 'No match found') : undefined
        });

        return success;
    } catch (e) {
        const elapsed = Date.now() - start;
        allResults.push({
            api: apiName,
            testCase: testCaseName,
            success: false,
            time: elapsed,
            error: String(e).substring(0, 50)
        });
        return false;
    }
}

async function runAllTests() {
    console.log('=== COMPREHENSIVE API TEST ===\n');
    console.log('Testing each API with multiple paper types...\n');

    for (const tc of TEST_CASES) {
        console.log(`\n--- ${tc.name} ---`);
        console.log(`Title: ${tc.title.substring(0, 50)}...`);
        console.log(`DOI: ${tc.doi}`);

        // Test all APIs with this test case
        process.stdout.write('  pubmed: ');
        const pm = await testApi('pubmed', () => searchPubMed(tc.title), tc.name);
        console.log(pm ? 'OK' : 'x');

        process.stdout.write('  openalex: ');
        const oa = await testApi('openalex', () => searchOpenAlex(tc.title), tc.name);
        console.log(oa ? 'OK' : 'x');

        process.stdout.write('  crossref: ');
        const cr = await testApi('crossref', () => searchCrossRef(tc.title), tc.name);
        console.log(cr ? 'OK' : 'x');

        process.stdout.write('  semantic_scholar: ');
        const ss = await testApi('semantic_scholar', () => searchSemanticScholar(tc.title, tc.doi), tc.name);
        console.log(ss ? 'OK' : 'x');

        process.stdout.write('  europe_pmc: ');
        const ep = await testApi('europe_pmc', () => searchEuropePMC(tc.title), tc.name);
        console.log(ep ? 'OK' : 'x');

        process.stdout.write('  arxiv: ');
        const ax = await testApi('arxiv', () => searchArxiv(tc.title), tc.name);
        console.log(ax ? 'OK' : 'x');

        process.stdout.write('  datacite: ');
        const dc = await testApi('datacite', () => searchDataCite(tc.title, tc.doi), tc.name);
        console.log(dc ? 'OK' : 'x');

        process.stdout.write('  unpaywall: ');
        const uw = await testApi('unpaywall', () => searchUnpaywall(tc.doi), tc.name);
        console.log(uw ? 'OK' : 'x');

        process.stdout.write('  doaj: ');
        const dj = await testApi('doaj', () => searchDOAJ(tc.doi), tc.name);
        console.log(dj ? 'OK' : 'x');

        process.stdout.write('  orcid: ');
        const or = await testApi('orcid', () => searchORCID(tc.author), tc.name);
        console.log(or ? 'OK' : 'x');

        process.stdout.write('  core: ');
        const co = await testApi('core', () => searchCore(tc.title), tc.name);
        console.log(co ? 'OK' : 'x');
    }

    // Summary
    console.log('\n\n=== SUMMARY BY API ===\n');
    console.log('API'.padEnd(20) + 'Success Rate');
    console.log('-'.repeat(35));

    const apiNames = ['pubmed', 'openalex', 'crossref', 'semantic_scholar', 'europe_pmc',
        'arxiv', 'datacite', 'unpaywall', 'doaj', 'orcid', 'core'];

    for (const api of apiNames) {
        const success = apiSuccessCount[api] || 0;
        const total = TEST_CASES.length;
        const pct = ((success / total) * 100).toFixed(0);
        const bar = '█'.repeat(success) + '░'.repeat(total - success);
        console.log(`${api.padEnd(20)}${bar} ${success}/${total} (${pct}%)`);
    }

    // Save detailed results
    const outputPath = path.join(__dirname, 'comprehensive-test-results.json');
    fs.writeFileSync(outputPath, JSON.stringify({
        summary: apiSuccessCount,
        testCases: TEST_CASES.map(tc => tc.name),
        results: allResults
    }, null, 2));

    console.log(`\nDetailed results: ${outputPath}`);

    // Final verdict
    const allApisWork = Object.values(apiSuccessCount).every(v => v >= 1);
    console.log(`\n${allApisWork ? '✅ All APIs working!' : '⚠️ Some APIs need attention'}`);
}

runAllTests().catch(console.error);
