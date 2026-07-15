
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function searchSemanticScholar(title: string, doi?: string): Promise<any> {
    if (!title && !doi) return null;
    const debug: any = { input_title: title, input_doi: doi, attempts: [] };

    console.log('--- Debugging Semantic Scholar ---');
    console.log('API Key Present:', !!process.env.SEMANTIC_SCHOLAR_API_KEY);

    try {
        const headers = {
            'x-api-key': process.env.SEMANTIC_SCHOLAR_API_KEY || '',
            'User-Agent': 'InfinityResearch/1.0'
        };
        debug.api_key_present = !!process.env.SEMANTIC_SCHOLAR_API_KEY;

        // 1. Try DOI first if available
        if (doi) {
            console.log(`\n[Method: DOI] Testing DOI: ${doi}`);
            // Recriando a URL exata do código de produção (sem doi, com externalIds)
            const doiUrl = `https://api.semanticscholar.org/graph/v1/paper/${doi}?fields=title,externalIds,citationCount,authors,year,abstract`;
            debug.doi_url = doiUrl;
            console.log('URL:', doiUrl);

            const start = Date.now();
            const doiRes = await fetch(doiUrl, { headers });
            const time = Date.now() - start;

            console.log('Status:', doiRes.status, doiRes.statusText);

            if (doiRes.ok) {
                const raw = await doiRes.json();
                console.log('Response Success:', raw.title ? 'Title Found' : 'No Title');
                // Check if externalIds has DOI
                console.log('External IDs:', JSON.stringify(raw.externalIds));
                if (raw.title) {
                    debug.attempts.push({ method: 'doi', status: 'success', time_ms: time });
                    return { success: true, source: 'semantic_scholar', raw, _debug: debug };
                }
            } else {
                const errorText = await doiRes.text();
                console.log('Response Error Body:', errorText);
                debug.attempts.push({ method: 'doi', status: 'failed', error: `http ${doiRes.status}`, url: doiUrl, time_ms: time });
            }
        } else {
            console.log('\n[Method: DOI] Skipped (No DOI provided)');
        }

        // 2. Fallback to title search
        console.log(`\n[Method: Title] Testing Title: "${title}"`);
        // Recriando a URL exata do código de produção (sem doi, com externalIds)
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=1&fields=title,externalIds,citationCount,authors,year,abstract`;
        debug.search_url = url;
        console.log('URL:', url);

        const start = Date.now();
        const res = await fetch(url, { headers });
        const time = Date.now() - start;

        console.log('Status:', res.status, res.statusText);

        if (!res.ok) {
            const errorText = await res.text();
            console.log('Response Error Body:', errorText);
            debug.attempts.push({ method: 'title', status: 'failed', error: `http ${res.status}`, url: url, time_ms: time });
            return { success: false, error: `http error ${res.status}`, _debug: debug };
        }

        const data = await res.json();
        const raw = data.data?.[0];
        console.log('Data Found:', raw ? 'Yes' : 'No');
        if (raw) console.log('Found Title:', raw.title);

        if (!raw) {
            debug.attempts.push({ method: 'title', status: 'failed', error: 'no results', url: url, time_ms: time });
            return { success: false, error: 'No match found', _debug: debug };
        }

        debug.attempts.push({ method: 'title', status: 'success', time_ms: time });
        return { success: true, source: 'semantic_scholar', raw, _debug: debug };
    } catch (e: any) {
        console.log('EXCEPTION:', e.message);
        debug.error = e.message;
        return { success: false, error: e.message, _debug: debug };
    }
}

async function runTests() {
    // Test 1: Only Title (The BUG scenario)
    console.log('\n=============================================');
    console.log('TEST 1: Title Only ("Attention Is All You Need")');
    console.log('=============================================');
    await searchSemanticScholar("Attention Is All You Need", undefined);

    // Test 2: Title + DOI (The Control scenario)
    console.log('\n=============================================');
    console.log('TEST 2: Title + Valid DOI (10.48550/arXiv.1706.03762)');
    console.log('=============================================');
    await searchSemanticScholar("Attention Is All You Need", "10.48550/arXiv.1706.03762");
}

runTests();
