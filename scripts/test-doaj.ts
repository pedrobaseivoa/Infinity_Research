/**
 * Test DOAJ API specifically - saves results to JSON
 * Run with: npx tsx scripts/test-doaj.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config({ path: '.env.local' });

// Papers que deveriam estar no DOAJ (Open Access journals)
const testDOIs = [
    '10.1371/journal.pone.0199852',   // PLoS ONE
    '10.3390/jcm9061749',              // MDPI Journal of Clinical Medicine
    '10.1186/s12889-020-09877-3',      // BMC Public Health
    '10.3389/fmed.2020.00240',         // Frontiers in Medicine
    '10.7717/peerj.9386',              // PeerJ
];

interface Result {
    doi: string;
    status: number;
    success: boolean;
    title?: string;
    journal?: string;
    error?: string;
}

const results: Result[] = [];

async function testDOAJ(doi: string) {
    const url = `https://doaj.org/api/v2/search/articles/${encodeURIComponent(doi)}`;

    try {
        const res = await fetch(url);

        if (res.ok) {
            const data = await res.json();
            if (data.results?.[0]) {
                const bibjson = data.results[0].bibjson;
                results.push({
                    doi,
                    status: res.status,
                    success: true,
                    title: bibjson?.title?.substring(0, 80),
                    journal: bibjson?.journal?.title
                });
            } else {
                results.push({
                    doi,
                    status: res.status,
                    success: false,
                    error: 'No results in response'
                });
            }
        } else {
            results.push({
                doi,
                status: res.status,
                success: false,
                error: `HTTP ${res.status}`
            });
        }
    } catch (e) {
        results.push({
            doi,
            status: 0,
            success: false,
            error: String(e)
        });
    }
}

async function testTitleSearch() {
    const title = 'COVID-19 machine learning';
    const url = `https://doaj.org/api/v2/search/articles/${encodeURIComponent(title)}`;

    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            return {
                query: title,
                total: data.total || 0,
                firstResult: data.results?.[0]?.bibjson?.title?.substring(0, 60)
            };
        }
        return { query: title, error: `HTTP ${res.status}` };
    } catch (e) {
        return { query: title, error: String(e) };
    }
}

async function main() {
    for (const doi of testDOIs) {
        await testDOAJ(doi);
    }

    const titleSearch = await testTitleSearch();

    const output = {
        doiTests: results,
        titleSearch,
        summary: {
            total: results.length,
            success: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        }
    };

    fs.writeFileSync('scripts/doaj-results.json', JSON.stringify(output, null, 2));
    console.log('Results saved to scripts/doaj-results.json');
    console.log(`Success: ${output.summary.success}/${output.summary.total}`);
}

main().catch(console.error);
