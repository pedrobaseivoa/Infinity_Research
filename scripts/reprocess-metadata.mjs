/**
 * One-off script: Re-run Phase 2 (APIs) + Phase 3 (Consensus) + Phase 7 (Merge)
 * for all completed articles, keeping Phase 4/5/6 data intact.
 *
 * Fixes: arXiv XML parsing, CORE API key, clean Phase 3 prompt (no pipe contamination).
 *
 * Usage: node --env-file=.env.local scripts/reprocess-metadata.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PHASE3_MODEL = 'meta-llama/llama-4-maverick';
const PIPELINE_VERSION = '5.0';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local scripts/reprocess-metadata.mjs');
    process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ──

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArxivXml(xml) {
    if (!xml.includes('<entry>')) return null;
    const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
    if (!entry) return null;
    const getText = (tag) => entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() || null;
    const authors = [...entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g)].map(m => m[1].trim());
    const categories = [...entry.matchAll(/<category[^>]*term="([^"]+)"/g)].map(m => m[1]);
    const arxivId = getText('id')?.replace('http://arxiv.org/abs/', '') || null;
    return {
        arxiv_id: arxivId,
        title: getText('title')?.replace(/\s+/g, ' '),
        authors,
        abstract: getText('summary')?.replace(/\s+/g, ' '),
        published: getText('published'),
        updated: getText('updated'),
        categories,
        pdf_url: arxivId ? `https://arxiv.org/pdf/${arxivId}` : null,
    };
}

function cleanApiData(data) {
    if (!data || typeof data !== 'object') return data;
    const cleaned = { ...data };
    const blocked = ['fullText', 'full_text', 'body', 'content', 'plain_text', 'converted_body'];
    for (const field of blocked) {
        if (typeof cleaned[field] === 'string' && cleaned[field].length > 500) delete cleaned[field];
    }
    return cleaned;
}

async function searchApi(name, fn, extractResult, parseAsText = false) {
    const start = Date.now();
    try {
        const res = await fn();
        const time_ms = Date.now() - start;
        if (!res.ok) return { success: false, source: name, error: `HTTP ${res.status}`, time_ms };
        const data = parseAsText ? await res.text() : await res.json();
        const raw = extractResult(data);
        if (!raw) return { success: false, source: name, error: 'No match found', time_ms };
        return { success: true, source: name, raw, time_ms };
    } catch (e) {
        return { success: false, source: name, error: e.message || String(e), time_ms: Date.now() - start };
    }
}

// ── Phase 2: 11-API Enrichment ──

async function runPhase2(title, doi, firstAuthor, userKeys) {
    const ssHeaders = { 'User-Agent': 'InfinityResearch/2.0' };
    if (userKeys.semantic_scholar_api_key) ssHeaders['x-api-key'] = userKeys.semantic_scholar_api_key;
    const oaHeaders = { 'User-Agent': 'InfinityResearch/2.0' };
    if (userKeys.openalex_api_key) oaHeaders['Authorization'] = `Bearer ${userKeys.openalex_api_key}`;
    const coreKey = userKeys.core_api_key;

    const apiCalls = [
        searchApi('pubmed', () => {
            const q = doi ? `${encodeURIComponent(doi)}[DOI]` : encodeURIComponent(title);
            return fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${q}&retmode=json`);
        }, d => d?.esearchresult?.idlist?.[0]),

        searchApi('openalex', () => {
            const url = doi
                ? `https://api.openalex.org/works/https://doi.org/${doi}`
                : `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per-page=1`;
            return fetch(url, { headers: oaHeaders });
        }, d => doi ? (d?.title ? d : null) : d?.results?.[0]),

        searchApi('crossref', () => {
            const url = doi
                ? `https://api.crossref.org/works/${doi}`
                : `https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=1`;
            return fetch(url);
        }, d => doi ? d?.message : d?.message?.items?.[0]),

        searchApi('semantic_scholar', () => {
            const url = doi
                ? `https://api.semanticscholar.org/graph/v1/paper/${doi}?fields=title,externalIds,citationCount,authors,year,abstract`
                : `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=1&fields=title,externalIds,citationCount,authors,year,abstract`;
            return fetch(url, { headers: ssHeaders });
        }, d => d?.title ? d : d?.data?.[0]),

        searchApi('europe_pmc', () => {
            const q = doi ? `DOI:${doi}` : encodeURIComponent(title);
            return fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=1`);
        }, d => d?.resultList?.result?.[0]),

        searchApi('arxiv', () =>
            fetch(`https://export.arxiv.org/api/query?search_query=ti:${encodeURIComponent(title)}&max_results=1`),
            d => parseArxivXml(d), true
        ),

        searchApi('datacite', () =>
            fetch(`https://api.datacite.org/dois?query=${encodeURIComponent(doi || title)}&page[size]=1`),
            d => d?.data?.[0]
        ),

        searchApi('unpaywall', () => {
            if (!doi) return Promise.resolve(new Response(null, { status: 404 }));
            return fetch(`https://api.unpaywall.org/v2/${doi}?email=contact@infinityresearch.com`);
        }, d => d?.doi ? d : null),

        searchApi('doaj', () =>
            fetch(`https://doaj.org/api/v2/search/articles/${encodeURIComponent(title)}`),
            d => d?.results?.[0]
        ),

        searchApi('orcid', () =>
            fetch(`https://pub.orcid.org/v3.0/search/?q=${encodeURIComponent(firstAuthor)}`, { headers: { 'Accept': 'application/json' } }),
            d => {
                const results = d?.result?.slice(0, 3).map(item => ({
                    id: item['orcid-identifier']?.path,
                    uri: item['orcid-identifier']?.uri,
                }));
                return results?.length > 0 ? results : null;
            }
        ),

        searchApi('core', () => {
            if (!coreKey) return Promise.resolve(new Response(null, { status: 404 }));
            return fetch(`https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(title)}&limit=1`, {
                headers: { 'Authorization': `Bearer ${coreKey}` },
            });
        }, d => d?.results?.[0]),
    ];

    const apiNames = ['pubmed', 'openalex', 'crossref', 'semantic_scholar', 'europe_pmc', 'arxiv', 'datacite', 'unpaywall', 'doaj', 'orcid', 'core'];
    const results = await Promise.allSettled(apiCalls);

    const apis = {};
    const apiStatus = {};
    let successCount = 0;

    results.forEach((result, i) => {
        const name = apiNames[i];
        if (result.status === 'fulfilled' && result.value.success) {
            apis[name] = cleanApiData(result.value.raw);
            apiStatus[name] = { success: true, time_ms: result.value.time_ms };
            successCount++;
        } else {
            const error = result.status === 'fulfilled' ? result.value.error : (result.reason?.message || 'Failed');
            apiStatus[name] = { success: false, error };
        }
    });

    return {
        ...apis,
        _status: apiStatus,
        _stats: { success: successCount, failed: 11 - successCount, total: 11 },
    };
}

// ── Phase 3: Consensus (LLM) ──

const PHASE3_SCHEMA = {
    name: 'phase3_consensus',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            title: { type: 'string' },
            authors: { type: 'array', items: { type: 'string' } },
            doi: { type: ['string', 'null'] },
            pmid: { type: ['string', 'null'] },
            abstract: { type: 'string' },
            journal: { type: 'string' },
            year: { type: 'integer' },
            keywords: { type: 'array', items: { type: 'string' } },
            citations_count: { type: ['integer', 'null'] },
            publisher: { type: ['string', 'null'] },
            open_access: { type: ['boolean', 'null'] },
            orcid_ids: { type: 'array', items: { type: 'string' } },
            field_sources: { type: 'object', description: 'Provenance: which sources confirmed each field', additionalProperties: { type: 'string' } },
            conflicts_resolved: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, chosen: { type: 'string' }, reason: { type: 'string' } }, required: ['field', 'chosen', 'reason'], additionalProperties: false } },
            rejected_sources: { type: 'array', items: { type: 'object', properties: { source: { type: 'string' }, reason: { type: 'string' } }, required: ['source', 'reason'], additionalProperties: false } },
        },
        required: ['title', 'authors', 'doi', 'pmid', 'abstract', 'journal', 'year', 'keywords', 'citations_count', 'publisher', 'open_access', 'orcid_ids', 'field_sources', 'conflicts_resolved', 'rejected_sources'],
        additionalProperties: false,
    },
};

async function runPhase3(phase1Output, phase2Output, apiKey) {
    const prompt = `You are a Data Reconciliation Engine. Create a GOLDEN RECORD from multiple sources.

CRITICAL FORMATTING RULE:
- The "field_sources" object is where you record provenance (which sources confirmed each field).
- ALL OTHER fields (title, authors, doi, journal, abstract, etc.) must contain ONLY the clean data value.
- NEVER append source tags like "|vision|openalex" to field values. Source tags go ONLY in "field_sources".

PROVENANCE (field_sources only):
- "|" = sources CONFIRM the same value (e.g. "vision|openalex|crossref")
- "+" = sources COMPLEMENT with different data (e.g. "openalex+europe_pmc")
- "none" = no source provided the field

VALIDATION RULES:
1. If API DOI differs from vision DOI, REJECT that API and add to rejected_sources
2. If PMID exists in ANY source, include it
3. For year conflicts, prefer Crossref (publisher source)
4. For citations, use OpenAlex or Semantic Scholar

VISION (from PDF):
${JSON.stringify(phase1Output, null, 2)}

API ENRICHMENT:
${JSON.stringify(phase2Output, null, 2)}`;

    const body = {
        model: PHASE3_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 16000,
        response_format: { type: 'json_schema', json_schema: PHASE3_SCHEMA },
    };

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://infinityresearch.app',
                    'X-Title': 'Infinity Research',
                },
                body: JSON.stringify(body),
            });

            const data = await res.json();
            if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

            const content = data.choices?.[0]?.message?.content || '';
            const parsed = JSON.parse(content);
            const usage = data.usage || {};
            const cost = usage.cost || usage.total_cost || 0;

            return {
                parsed,
                model: data.model || PHASE3_MODEL,
                usage: {
                    prompt_tokens: usage.prompt_tokens || 0,
                    completion_tokens: usage.completion_tokens || 0,
                    total_cost: cost,
                },
                timestamp: new Date().toISOString(),
            };
        } catch (e) {
            if (attempt < 2) {
                console.log(`  Phase 3 attempt ${attempt + 1} failed: ${e.message}, retrying...`);
                await sleep([2000, 4000][attempt]);
            } else {
                throw e;
            }
        }
    }
}

// ── Phase 7: Deterministic Merge ──

function runPhase7(phase3Output, phase6Scientific, confidenceScores) {
    return {
        phase3_consensus: phase3Output || {},
        phase6_scientific: { consolidated: phase6Scientific || {} },
        confidence_scores: confidenceScores || {},
        _processing: {
            pipeline_version: PIPELINE_VERSION,
            phases_completed: 7,
            merged_at: new Date().toISOString(),
        },
    };
}

// ── Main ──

async function main() {
    console.log('=== Metadata Reprocessing Script ===\n');

    // 1. Get user keys
    const { data: articles } = await sb.from('articles').select('user_id').eq('status', 'completed').limit(1);
    const userId = articles?.[0]?.user_id;
    if (!userId) { console.log('No completed articles found.'); return; }

    const { data: settings } = await sb.from('user_settings')
        .select('openrouter_api_key, semantic_scholar_api_key, openalex_api_key, core_api_key')
        .eq('user_id', userId).single();

    if (!settings?.openrouter_api_key) { console.log('No OpenRouter API key found.'); return; }

    // 2. Fetch all completed articles
    const { data: allArticles, error } = await sb.from('articles')
        .select('id, pdf_filename, phase1_json, phase2_json, phase3_json, phase6_json, phase7_json, confidence_scores, phase2_apis_success, phase3_cost, phase3_tokens, phase3_model')
        .eq('status', 'completed')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) { console.error('DB error:', error); return; }

    console.log(`Found ${allArticles.length} completed articles.`);
    console.log(`User keys: OpenRouter=yes, SS=${settings.semantic_scholar_api_key ? 'yes' : 'no'}, OA=${settings.openalex_api_key ? 'yes' : 'no'}, CORE=${settings.core_api_key ? 'yes' : 'no'}\n`);

    let totalPhase3Cost = 0;
    let processed = 0;
    let failed = 0;

    for (const article of allArticles) {
        const shortTitle = (article.pdf_filename || article.id).substring(0, 60);
        process.stdout.write(`[${processed + 1}/${allArticles.length}] ${shortTitle}...`);

        try {
            const phase1Output = article.phase1_json?.output;
            if (!phase1Output) {
                console.log(' SKIP (no Phase 1 data)');
                continue;
            }

            const title = phase1Output.title || '';
            const doi = phase1Output.doi || '';
            const authors = phase1Output.authors || [];
            const firstAuthor = authors[0] || '';

            // Phase 2: Re-run APIs
            const phase2Output = await runPhase2(title, doi, firstAuthor, settings);
            const p2Success = phase2Output._stats.success;

            // Phase 3: Re-run Consensus
            const p3Result = await runPhase3(phase1Output, phase2Output, settings.openrouter_api_key);
            totalPhase3Cost += p3Result.usage.total_cost;

            // Phase 7: Re-merge with existing Phase 6
            const phase6Scientific = article.phase6_json?.output?.consolidated || article.phase7_json?.output?.phase6_scientific?.consolidated || {};
            const confidenceScores = article.confidence_scores || article.phase7_json?.output?.confidence_scores || {};
            const phase7Output = runPhase7(p3Result.parsed, phase6Scientific, confidenceScores);

            // Save to DB
            await sb.from('articles').update({
                phase2_json: phase2Output,
                phase2_apis_success: p2Success,
                phase2_apis_failed: 11 - p2Success,
                phase3_json: {
                    output: p3Result.parsed,
                    api_status: phase2Output._status || {},
                    api_stats: phase2Output._stats || {},
                    model: p3Result.model,
                    usage: p3Result.usage,
                    timestamp: p3Result.timestamp,
                },
                phase3_model: p3Result.model,
                phase3_cost: p3Result.usage.total_cost,
                phase3_tokens: p3Result.usage.prompt_tokens + p3Result.usage.completion_tokens,
                phase7_json: { output: phase7Output },
                phase7_completed_at: new Date().toISOString(),
            }).eq('id', article.id);

            processed++;
            console.log(` OK (APIs: ${p2Success}/11, P3 cost: $${p3Result.usage.total_cost.toFixed(4)})`);

            // Rate limit pause
            await sleep(500);
        } catch (e) {
            failed++;
            console.log(` FAIL: ${e.message}`);
        }
    }

    console.log(`\n=== Done ===`);
    console.log(`Processed: ${processed}/${allArticles.length}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total Phase 3 cost: $${totalPhase3Cost.toFixed(4)}`);
}

main().catch(console.error);
