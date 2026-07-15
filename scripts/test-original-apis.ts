/**
 * Test script using the ORIGINAL enrichment functions from /lib/api/enrichment/
 * Run with: npx tsx scripts/test-original-apis.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Import original functions - using relative paths
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

const TEST_TITLE = "Virtual reality and augmented reality ophthalmology systematic review";
const TEST_DOI = "10.1016/j.survophthal.2022.02.001";
const TEST_AUTHOR = "Chan YK";

interface TestResult {
    api: string;
    success: boolean;
    size: string;
    time: number;
    data?: any;
    error?: string;
}

function getSize(obj: any): string {
    const bytes = Buffer.byteLength(JSON.stringify(obj || {}), 'utf8');
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} bytes`;
}

async function runTests() {
    console.log('Testing ORIGINAL enrichment functions from /lib/api/enrichment/\n');
    console.log(`Title: "${TEST_TITLE}"`);
    console.log(`DOI: ${TEST_DOI}`);
    console.log(`Author: ${TEST_AUTHOR}\n`);

    const results: TestResult[] = [];

    const apis = [
        { name: 'pubmed', fn: () => searchPubMed(TEST_TITLE) },
        { name: 'openalex', fn: () => searchOpenAlex(TEST_TITLE) },
        { name: 'crossref', fn: () => searchCrossRef(TEST_TITLE) },
        { name: 'semantic_scholar', fn: () => searchSemanticScholar(TEST_TITLE, TEST_DOI) },
        { name: 'europe_pmc', fn: () => searchEuropePMC(TEST_TITLE) },
        { name: 'arxiv', fn: () => searchArxiv(TEST_TITLE) },
        { name: 'datacite', fn: () => searchDataCite(TEST_TITLE, TEST_DOI) },
        { name: 'unpaywall', fn: () => searchUnpaywall(TEST_DOI) },
        { name: 'doaj', fn: () => searchDOAJ(TEST_DOI) },
        { name: 'orcid', fn: () => searchORCID(TEST_AUTHOR) },
        { name: 'core', fn: () => searchCore(TEST_TITLE) },
    ];

    for (const api of apis) {
        const start = Date.now();
        console.log(`Testing ${api.name}...`);

        try {
            const result = await api.fn();
            const elapsed = Date.now() - start;
            const size = getSize(result);
            const success = result?.success === true;

            results.push({
                api: api.name,
                success,
                size,
                time: elapsed,
                data: success ? {
                    title: result.title?.substring(0, 60),
                    doi: result.doi,
                    year: result.year || result.publication_year || result.yearPublished,
                    citations: result.citationCount || result.cited_by_count
                } : undefined,
                error: !success ? (result?.error || 'No data') : undefined
            });

            console.log(`  ${success ? 'OK' : 'FAILED'} - ${size} (${elapsed}ms)`);
        } catch (e) {
            const elapsed = Date.now() - start;
            console.log(`  ERROR: ${e}`);
            results.push({
                api: api.name,
                success: false,
                size: '0',
                time: elapsed,
                error: String(e)
            });
        }
    }

    // Save results
    const outputPath = path.join(__dirname, 'original-apis-test-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    // Print summary
    console.log('\n=== SUMMARY ===\n');
    console.log('API'.padEnd(20) + 'Status'.padEnd(10) + 'Size'.padEnd(15) + 'Time');
    console.log('-'.repeat(55));

    let successCount = 0;
    let totalSize = 0;

    for (const r of results) {
        const status = r.success ? 'OK' : 'FAILED';
        console.log(`${r.api.padEnd(20)}${status.padEnd(10)}${r.size.padEnd(15)}${r.time}ms`);
        if (r.success) {
            successCount++;
            const bytes = Buffer.byteLength(JSON.stringify(r.data || {}), 'utf8');
            totalSize += bytes;
        }
    }

    console.log('-'.repeat(55));
    console.log(`TOTAL: ${successCount}/${results.length} APIs succeeded`);
    console.log(`\nFull results: ${outputPath}`);
}

runTests().catch(console.error);
