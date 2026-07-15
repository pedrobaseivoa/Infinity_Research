import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callOpenRouter, fetchPdfAsBase64 } from '@/lib/processing/openrouter-client';
import { PIPELINE_CONFIG, VALIDATION_CONFIGS, resolveModel, resolvePhase4Models } from '@/lib/processing/models';
import type { PipelineOverride } from '@/lib/processing/models';
import { PHASE1_SCHEMA, PHASE3_SCHEMA, PHASE4_SCHEMA, PHASE5_SCHEMA, PHASE6_SCHEMA } from '@/lib/processing/schemas';

export const maxDuration = 300;

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function updateArticle(articleId: string, updates: Record<string, unknown>) {
    const { error } = await supabase.from('articles').update(updates).eq('id', articleId);
    if (error) console.error('Failed to update article:', error.message);
}

interface UserKeys {
    openrouter_api_key: string;
    semantic_scholar_api_key?: string;
    openalex_api_key?: string;
    core_api_key?: string;
}

async function getUserKeys(userId: string): Promise<UserKeys> {
    const { data, error } = await supabase
        .from('user_settings')
        .select('openrouter_api_key, semantic_scholar_api_key, openalex_api_key, core_api_key')
        .eq('user_id', userId)
        .single();

    if (error || !data?.openrouter_api_key) {
        throw new Error('OpenRouter API key not configured. Go to Settings to add your key.');
    }

    return data as UserKeys;
}

// ==================== PHASE 1: Metadata Extraction ====================
async function runPhase1(articleId: string, pdfBase64: string, apiKey: string, configOverride?: PipelineOverride) {
    const startTime = Date.now();
    const model = resolveModel(1, configOverride);

    const prompt = `You are a scientific paper metadata extractor. Analyze this PDF and extract metadata.
Return a JSON object following the provided schema exactly.
If a field is not found in the paper, use null for nullable fields or empty arrays for array fields.
For study_type, choose the most appropriate category based on the paper's methodology.`;

    const result = await callOpenRouter({
        model,
        prompt,
        apiKey,
        pdfBase64,
        responseSchema: PHASE1_SCHEMA,
    });

    const duration_ms = Date.now() - startTime;

    await updateArticle(articleId, {
        phase1_json: { output: result.parsed, model: result.model, usage: result.usage, duration_ms, timestamp: result.timestamp },
        phase1_status: 'completed',
        phase1_model: result.model,
        phase1_cost: result.usage.total_cost,
        phase1_tokens: result.usage.prompt_tokens + result.usage.completion_tokens,
        phase1_duration_ms: duration_ms,
        phase1_prompt_tokens: result.usage.prompt_tokens,
        phase1_completion_tokens: result.usage.completion_tokens,
        phase1_completed_at: result.timestamp,
    });

    return {
        output: result.parsed,
        cost: result.usage.total_cost,
        duration_ms,
        tokens: result.usage.prompt_tokens + result.usage.completion_tokens,
        reported_cost: result.usage.reported_cost,
        calculated_cost: result.usage.calculated_cost,
    };
}

// ==================== PHASE 2: 11-API Enrichment ====================
async function searchApi(name: string, fn: () => Promise<Response>, extractResult: (data: unknown) => unknown, parseAsText = false): Promise<{ success: boolean; source: string; raw?: unknown; error?: string; time_ms: number }> {
    const start = Date.now();
    try {
        const res = await fn();
        const time_ms = Date.now() - start;
        if (!res.ok) return { success: false, source: name, error: `HTTP ${res.status}`, time_ms };
        const data = parseAsText ? await res.text() : await res.json();
        const raw = extractResult(data);
        if (!raw) return { success: false, source: name, error: 'No match found', time_ms };
        return { success: true, source: name, raw, time_ms };
    } catch (e: unknown) {
        return { success: false, source: name, error: e instanceof Error ? e.message : String(e), time_ms: Date.now() - start };
    }
}

function parseArxivXml(xml: string): Record<string, unknown> | null {
    if (!xml.includes('<entry>')) return null;
    const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
    if (!entry) return null;

    const getText = (tag: string) => entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() || null;
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

async function runPhase2(articleId: string, phase1Output: Record<string, unknown>, userKeys: UserKeys) {
    const startTime = Date.now();
    const title = (phase1Output?.title as string) || '';
    const doi = (phase1Output?.doi as string) || '';
    const authors = (phase1Output?.authors as string[]) || [];
    const firstAuthor = authors[0] || '';

    const ssHeaders: Record<string, string> = { 'User-Agent': 'InfinityResearch/2.0' };
    if (userKeys.semantic_scholar_api_key) ssHeaders['x-api-key'] = userKeys.semantic_scholar_api_key;

    const oaHeaders: Record<string, string> = { 'User-Agent': 'InfinityResearch/2.0' };
    if (userKeys.openalex_api_key) oaHeaders['Authorization'] = `Bearer ${userKeys.openalex_api_key}`;

    const coreKey = userKeys.core_api_key || process.env.CORE_API_KEY;

    const apiCalls = [
        searchApi('pubmed', () => {
            const query = doi ? `${encodeURIComponent(doi)}[DOI]` : encodeURIComponent(title);
            return fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${query}&retmode=json`);
        }, (data: any) => data?.esearchresult?.idlist?.[0]),

        searchApi('openalex', () => {
            const url = doi
                ? `https://api.openalex.org/works/https://doi.org/${doi}`
                : `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per-page=1`;
            return fetch(url, { headers: oaHeaders });
        }, (data: any) => doi ? (data?.title ? data : null) : data?.results?.[0]),

        searchApi('crossref', () => {
            const url = doi
                ? `https://api.crossref.org/works/${doi}`
                : `https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=1`;
            return fetch(url);
        }, (data: any) => doi ? data?.message : data?.message?.items?.[0]),

        searchApi('semantic_scholar', () => {
            const url = doi
                ? `https://api.semanticscholar.org/graph/v1/paper/${doi}?fields=title,externalIds,citationCount,authors,year,abstract`
                : `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=1&fields=title,externalIds,citationCount,authors,year,abstract`;
            return fetch(url, { headers: ssHeaders });
        }, (data: any) => data?.title ? data : data?.data?.[0]),

        searchApi('europe_pmc', () => {
            const query = doi ? `DOI:${doi}` : encodeURIComponent(title);
            return fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${query}&format=json&pageSize=1`);
        }, (data: any) => data?.resultList?.result?.[0]),

        searchApi('arxiv', () =>
            fetch(`https://export.arxiv.org/api/query?search_query=ti:${encodeURIComponent(title)}&max_results=1`),
            (data: any) => parseArxivXml(data),
            true
        ),

        searchApi('datacite', () =>
            fetch(`https://api.datacite.org/dois?query=${encodeURIComponent(doi || title)}&page[size]=1`),
            (data: any) => data?.data?.[0]
        ),

        searchApi('unpaywall', () => {
            if (!doi) return Promise.resolve(new Response(null, { status: 404 }));
            return fetch(`https://api.unpaywall.org/v2/${doi}?email=contact@infinityresearch.com`);
        }, (data: any) => data?.doi ? data : null),

        searchApi('doaj', () =>
            fetch(`https://doaj.org/api/v2/search/articles/${encodeURIComponent(title)}`),
            (data: any) => data?.results?.[0]
        ),

        searchApi('orcid', () =>
            fetch(`https://pub.orcid.org/v3.0/search/?q=${encodeURIComponent(firstAuthor)}`, { headers: { 'Accept': 'application/json' } }),
            (data: any) => {
                const results = data?.result?.slice(0, 3).map((item: any) => ({
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
        }, (data: any) => data?.results?.[0]),
    ];

    const results = await Promise.allSettled(apiCalls);

    const apis: Record<string, unknown> = {};
    const apiStatus: Record<string, unknown> = {};
    const apiNames = PIPELINE_CONFIG.phases[2].apis;
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

    const duration_ms = Date.now() - startTime;

    const fieldCoverage = computeFieldCoverage(apis);

    const output = {
        ...apis,
        _status: apiStatus,
        _stats: { success: successCount, failed: 11 - successCount, total: 11, elapsed_ms: duration_ms },
        _field_coverage: fieldCoverage,
    };

    await updateArticle(articleId, {
        phase2_json: output,
        phase2_status: 'completed',
        phase2_apis_success: successCount,
        phase2_apis_failed: 11 - successCount,
        phase2_duration_ms: duration_ms,
        phase2_completed_at: new Date().toISOString(),
    });

    return { output, cost: 0, duration_ms, tokens: 0, reported_cost: 0, calculated_cost: 0 };
}

function cleanApiData(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;
    const cleaned = { ...(data as Record<string, unknown>) };
    const blocked = ['fullText', 'full_text', 'body', 'content', 'plain_text', 'converted_body'];
    for (const field of blocked) {
        if (typeof cleaned[field] === 'string' && (cleaned[field] as string).length > 500) {
            delete cleaned[field];
        }
    }
    return cleaned;
}

/** Deterministic field coverage: check which standard fields each API actually returned. */
function computeFieldCoverage(apis: Record<string, unknown>): Record<string, string[]> {
    const coverage: Record<string, string[]> = {};
    const has = (obj: any, ...keys: string[]) => keys.some(k => {
        const v = obj?.[k];
        if (v === null || v === undefined) return false;
        if (typeof v === 'string') return v.trim().length > 0;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'number') return true;
        if (typeof v === 'boolean') return true;
        return !!v;
    });

    if (apis.pubmed) {
        coverage.pubmed = ['pmid'];
    }

    const oa = apis.openalex as any;
    if (oa) {
        const fields: string[] = [];
        if (has(oa, 'title', 'display_name')) fields.push('title');
        if (has(oa, 'authorships')) fields.push('authors');
        if (has(oa, 'doi')) fields.push('doi');
        if (has(oa, 'publication_year')) fields.push('year');
        if (oa?.primary_location?.source?.display_name || has(oa, 'host_venue')) fields.push('journal');
        if (has(oa, 'abstract_inverted_index')) fields.push('abstract');
        if (has(oa, 'cited_by_count')) fields.push('citations');
        if (oa?.open_access?.is_oa !== undefined) fields.push('open_access');
        if (fields.length) coverage.openalex = fields;
    }

    const cr = apis.crossref as any;
    if (cr) {
        const fields: string[] = [];
        if (has(cr, 'title')) fields.push('title');
        if (has(cr, 'author')) fields.push('authors');
        if (has(cr, 'DOI')) fields.push('doi');
        if (cr?.issued?.['date-parts']?.[0]?.[0] || cr?.published?.['date-parts']?.[0]?.[0]) fields.push('year');
        if (has(cr, 'container-title')) fields.push('journal');
        if (has(cr, 'abstract')) fields.push('abstract');
        if (has(cr, 'is-referenced-by-count')) fields.push('citations');
        if (fields.length) coverage.crossref = fields;
    }

    const ss = apis.semantic_scholar as any;
    if (ss) {
        const fields: string[] = [];
        if (has(ss, 'title')) fields.push('title');
        if (has(ss, 'authors')) fields.push('authors');
        if (ss?.externalIds?.DOI) fields.push('doi');
        if (has(ss, 'year')) fields.push('year');
        if (has(ss, 'abstract')) fields.push('abstract');
        if (has(ss, 'citationCount')) fields.push('citations');
        if (has(ss, 'openAccessPdf')) fields.push('open_access');
        if (ss?.externalIds?.PubMed) fields.push('pmid');
        if (fields.length) coverage.semantic_scholar = fields;
    }

    const ep = apis.europe_pmc as any;
    if (ep) {
        const fields: string[] = [];
        if (has(ep, 'title')) fields.push('title');
        if (has(ep, 'authorString')) fields.push('authors');
        if (has(ep, 'doi')) fields.push('doi');
        if (has(ep, 'pubYear')) fields.push('year');
        if (has(ep, 'journalTitle')) fields.push('journal');
        if (has(ep, 'citedByCount')) fields.push('citations');
        if (has(ep, 'pmid')) fields.push('pmid');
        if (ep?.isOpenAccess === 'Y' || ep?.isOpenAccess === 'N') fields.push('open_access');
        if (fields.length) coverage.europe_pmc = fields;
    }

    const ax = apis.arxiv as any;
    if (ax) {
        const fields: string[] = [];
        if (has(ax, 'title')) fields.push('title');
        if (has(ax, 'authors')) fields.push('authors');
        if (has(ax, 'abstract')) fields.push('abstract');
        if (has(ax, 'published')) fields.push('year');
        if (has(ax, 'arxiv_id')) fields.push('doi');
        if (fields.length) coverage.arxiv = fields;
    }

    const dc = apis.datacite as any;
    if (dc) {
        const attrs = dc?.attributes || dc;
        const fields: string[] = [];
        if (has(attrs, 'titles')) fields.push('title');
        if (has(attrs, 'creators')) fields.push('authors');
        if (has(attrs, 'doi')) fields.push('doi');
        if (has(attrs, 'publicationYear')) fields.push('year');
        if (fields.length) coverage.datacite = fields;
    }

    const uw = apis.unpaywall as any;
    if (uw) {
        const fields: string[] = [];
        if (has(uw, 'title')) fields.push('title');
        if (has(uw, 'doi')) fields.push('doi');
        if (has(uw, 'year')) fields.push('year');
        if (has(uw, 'journal_name')) fields.push('journal');
        if (has(uw, 'z_authors')) fields.push('authors');
        if (uw?.is_oa !== undefined) fields.push('open_access');
        if (fields.length) coverage.unpaywall = fields;
    }

    const dj = apis.doaj as any;
    if (dj) {
        const bib = dj?.bibjson || dj;
        const fields: string[] = [];
        if (has(bib, 'title')) fields.push('title');
        if (has(bib, 'author')) fields.push('authors');
        if (bib?.identifier?.some((i: any) => i.type === 'doi')) fields.push('doi');
        if (has(bib, 'journal')) fields.push('journal');
        if (has(bib, 'year')) fields.push('year');
        if (fields.length) coverage.doaj = fields;
    }

    const or = apis.orcid as any;
    if (or && Array.isArray(or) && or.length > 0) {
        coverage.orcid = ['orcid_ids'];
    }

    const co = apis.core as any;
    if (co) {
        const fields: string[] = [];
        if (has(co, 'title')) fields.push('title');
        if (has(co, 'authors')) fields.push('authors');
        if (has(co, 'abstract')) fields.push('abstract');
        if (has(co, 'doi')) fields.push('doi');
        if (has(co, 'yearPublished')) fields.push('year');
        if (has(co, 'journals')) fields.push('journal');
        if (has(co, 'citationCount')) fields.push('citations');
        if (fields.length) coverage.core = fields;
    }

    return coverage;
}

// ==================== PHASE 3: Consensus ====================
async function runPhase3(articleId: string, phase1Output: Record<string, unknown>, phase2Output: Record<string, unknown>, apiKey: string, configOverride?: PipelineOverride) {
    const startTime = Date.now();
    const model = resolveModel(3, configOverride);

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
5. Preserve study_type, funding_sources, conflict_of_interest, and registration_number from vision data (set to null if not found)

VISION (from PDF):
${JSON.stringify(phase1Output, null, 2)}

API ENRICHMENT:
${JSON.stringify(phase2Output, null, 2)}`;

    const result = await callOpenRouter({
        model,
        prompt,
        apiKey,
        responseSchema: PHASE3_SCHEMA,
    });

    const duration_ms = Date.now() - startTime;

    await updateArticle(articleId, {
        phase3_json: {
            output: result.parsed,
            api_status: phase2Output._status || {},
            api_stats: phase2Output._stats || {},
            field_coverage: phase2Output._field_coverage || {},
            model: result.model,
            usage: result.usage,
            duration_ms,
            timestamp: result.timestamp,
        },
        phase3_status: 'completed',
        phase3_model: result.model,
        phase3_cost: result.usage.total_cost,
        phase3_tokens: result.usage.prompt_tokens + result.usage.completion_tokens,
        phase3_duration_ms: duration_ms,
        phase3_prompt_tokens: result.usage.prompt_tokens,
        phase3_completion_tokens: result.usage.completion_tokens,
        phase3_completed_at: result.timestamp,
    });

    return {
        output: result.parsed,
        cost: result.usage.total_cost,
        duration_ms,
        tokens: result.usage.prompt_tokens + result.usage.completion_tokens,
        reported_cost: result.usage.reported_cost,
        calculated_cost: result.usage.calculated_cost,
    };
}

// ==================== PHASE 4: Multi-Model Extraction ====================
async function runPhase4(articleId: string, pdfBase64: string, phase3Output: Record<string, unknown>, apiKey: string, configOverride?: PipelineOverride) {
    const startTime = Date.now();
    const models = resolvePhase4Models(configOverride);
    const title = (phase3Output?.title as string) || 'Unknown';
    const studyType = (phase3Output as any)?.study_type || '';

    let studyTypeGuidance = '';
    if (['RCT'].includes(studyType)) {
        studyTypeGuidance = 'This is an RCT. Pay special attention to: PICO framework, randomization method, blinding, intention-to-treat analysis, allocation concealment.';
    } else if (['Cohort', 'Case-Control', 'Cross-Sectional'].includes(studyType)) {
        studyTypeGuidance = 'This is an observational study. Focus on: exposure/outcome definitions, confounders adjusted for, follow-up duration, selection criteria.';
    } else if (['Systematic Review', 'Meta-Analysis'].includes(studyType)) {
        studyTypeGuidance = 'This is a review/meta-analysis. Focus on: search strategy, databases searched, inclusion/exclusion criteria, quality assessment tool, heterogeneity measures.';
    } else if (['Comparative', 'Validation', 'Diagnostic', 'Experimental'].includes(studyType)) {
        studyTypeGuidance = 'This is a comparative/validation study. Focus on: group definitions (e.g. experts vs novices vs intermediates), performance metrics for ALL groups, statistical comparisons between groups. Extract outcomes for EVERY pairwise comparison reported.';
    }

    const titleLower = title.toLowerCase();
    const isIncidenceStudy = /\b(incidence|prevalence|surveillance|registry|epidemiology|epidemiologic|population.based)\b/i.test(titleLower)
        || (['Cohort', 'Cross-Sectional'].includes(studyType) && /\b(rate|incidence|death|mortality|arrest|occurrence)\b/i.test(titleLower));

    const structuredOutcomesBlock = isIncidenceStudy
        ? `STRUCTURED OUTCOMES — INCIDENCE META-ANALYSIS:
This is an incidence/prevalence study. Extract ALL reported incidence data into "structured_outcomes".

WHAT TO EXTRACT — FOR EACH REPORTED INCIDENCE ESTIMATE, CREATE ONE ROW:

1. CORE INCIDENCE DATA (required for every row):
  - name: Descriptive label, e.g. "SCD Incidence - Overall", "SCA Incidence - Male", "SCD Incidence - Basketball"
  - comparison_type: "single_arm" (this is an incidence study without comparator)
  - arm1_label: The population described, e.g. "NCAA Athletes", "Male Competitive Athletes", "Basketball Players"
  - arm1_events: Number of events (integer)
  - arm1_total: Total number of individuals in the denominator (if reported as headcount)
  - arm1_n: Same as arm1_total for incidence studies

2. DENOMINATOR AND RATE CONVERSION — CRITICAL:
  - If the study reports PERSON-YEARS (athlete-years): set effect_measure="incidence_rate" and effect_size = rate per 100,000 person-years.
  - CONVERT if needed: if the paper reports rate per 1,000,000 (per million), divide by 10 to get per 100,000. Example: "9.4 per million" = 0.94 per 100,000.
  - CALCULATE if needed: if the paper reports only raw counts and person-years (e.g. 18 deaths in 829,089 person-years), calculate the rate yourself: (18/829,089)*100,000 = 2.17 per 100,000. Set effect_measure="incidence_rate" and effect_size=2.17.
  - If the study reports only CRUDE PROPORTION (events/total without person-time): set effect_measure="proportion" and proportion = events/total.
  - If the study reports BOTH person-years AND headcount: extract BOTH as separate rows.
  - ALWAYS extract the raw counts (arm1_events, arm1_total) even when a rate is reported.
  - arm1_total should be the PERSON-YEARS denominator when available (e.g. 829,089 athlete-years), not the headcount.

3. STUDY PERIOD:
  - timepoint: The observation period, e.g. "2004-2008", "10 years", "2003-2013". This is essential for calculating person-time.

4. SUBGROUP DATA — Extract as SEPARATE rows when reported:
  - By event type: always specify the event type in the name (e.g. SCA, SCD, composite SCA/SCD, cardiac death, all-cause death)
  - By sex: male, female (e.g. "SCD Incidence - Male Athletes")
  - By age stratum: if age-stratified data exists (e.g. "SCA Incidence - Age 12-17")
  - By sport type: if sport-specific data exists (e.g. "SCD Incidence - Basketball", "SCD Incidence - Soccer")
  - By competitive level: scholastic, collegiate, professional, elite (e.g. "SCA Incidence - NCAA Division I")
  - By geographic region: country or region (e.g. "SCD Incidence - United States")
  - By screening status: screened vs unscreened populations (e.g. "SCA Incidence - Pre-participation Screening")
  - By ascertainment method: prospective surveillance, retrospective registry, media-based, insurance claims, etc.
  - By timing: exertional-only vs any-time events (e.g. "SCD Incidence - Exertional Only")

5. EFFECT SIZE AND CI:
  - effect_size: The reported incidence rate per 100,000 person-years (or per the study's own denominator unit)
  - ci_lower, ci_upper: 95% CI if reported
  - p_value: Usually not applicable for single-arm incidence — set null unless explicitly reported
  - direction_favorable: "lower" (lower incidence = better outcome)

6. CATEGORY MAPPING:
  - category="primary" for: overall incidence estimates (the main reported rate)
  - category="secondary" for: subgroup analyses (by sex, sport, age, region, screening status, etc.)
  - category="exploratory" for: sensitivity analyses, alternative denominators, derived estimates

7. TYPE MAPPING:
  - type="count" for raw event counts with person-time denominators
  - type="binary" for crude proportions (events/total individuals)

PAIRWISE STUDIES THAT ALSO REPORT ABSOLUTE RATES:
- Some studies compare athletes vs non-athletes (pairwise) AND report the absolute incidence rate for each group separately.
- In these cases, extract BOTH: (1) the pairwise comparison with RR/IRR, AND (2) separate single_arm rows for each group's absolute incidence rate.
- Example: if a paper reports "athletes: 2.3/100,000; non-athletes: 0.9/100,000; RR=2.5", create THREE rows:
  * "SD Incidence - Athletes" (single_arm, incidence_rate=2.3)
  * "SD Incidence - Non-Athletes" (single_arm, incidence_rate=0.9)
  * "SD Risk - Athletes vs Non-Athletes" (pairwise, RR=2.5)

ADDITIONAL DATA TO EXTRACT IF REPORTED:
- Survival after cardiac arrest (e.g. "Survival After SCA", proportion)
- Etiology/cause of death distribution (e.g. "HCM as Cause of SCD", type="binary", proportion)
- Screening detection rates

GENERAL RULES:
- Extract from ALL tables, figures, and text — not just the abstract.
- If a study reports incidence for MULTIPLE time periods or subgroups, create SEPARATE rows for each.
- ALWAYS include raw event counts even when only a calculated rate is highlighted.
- Cite the source (Table, Figure, or page) for each outcome.
- Do NOT merge subgroup data into a single row.`
        : `STRUCTURED OUTCOMES (for meta-analysis):
Extract EVERY quantitative outcome reported in the paper into the "structured_outcomes" array. Each outcome is a separate object with numerical fields.

STEP 1 — DETERMINE COMPARISON TYPE FOR EACH OUTCOME:
- "single_arm": Only ONE group measured, no comparator. Common in case series, registries, single-arm trials, prevalence/incidence studies.
- "pairwise": TWO groups compared directly (e.g. treatment vs placebo, pre vs post-intervention). This is the most common type.
- "network": The paper compares 3+ distinct treatments/interventions and you are extracting a specific pairwise comparison that is part of a larger network.

STEP 2 — LABEL THE ARMS:
- "arm1_label": Name of the first/main group exactly as described in the paper.
- "arm2_label": Name of the second/comparison group. Set null for single_arm.
- Use the EXACT group names from the paper. Do NOT use generic labels like "intervention" or "control".

STEP 3 — FILL NUMERICAL DATA BASED ON OUTCOME TYPE:

For CONTINUOUS outcomes (mean ± SD):
  - Fill arm1_mean, arm1_sd, arm1_n (and arm2_mean, arm2_sd, arm2_n if pairwise/network).
  - If the paper reports SE instead of SD, convert: SD = SE × √n. Set se_reported=true.
  - For pre-post designs on the SAME group: arm1 = post, arm2 = pre, and fill correlation_pre_post if reported.
  - Single-arm continuous: fill only arm1_mean, arm1_sd, arm1_n.

For BINARY outcomes (events/total):
  - Pairwise: fill arm1_events, arm1_total AND arm2_events, arm2_total.
  - Single-arm: fill arm1_events, arm1_total AND proportion.

For INCIDENCE / RATES:
  - Use effect_measure="incidence_rate" and fill effect_size with the rate value (e.g. per 100,000 person-years).
  - Fill arm1_events, arm1_total if raw counts are available.
  - For rate ratios between two groups: use effect_measure="IRR".

For CORRELATIONS:
  - Use effect_measure="r" or "R2" and fill effect_size.

For TIME-TO-EVENT:
  - Use effect_measure="HR" and fill effect_size, ci_lower, ci_upper.

STEP 4 — EFFECT SIZE AND DIRECTION:
- effect_measure: MD, SMD, WMD, OR, RR, RD, NNT, HR, incidence_rate, prevalence, IRR, AUC, sensitivity, specificity, PPV, NPV, LR+, r, R2, proportion, mean, other, N/A.
- effect_size: The numeric value of the reported effect.
- ci_lower, ci_upper: 95% CI bounds if reported.
- p_value: As string (e.g. "0.003", "<0.001", "NS").
- direction_favorable: "lower" for mortality/complications/errors, "higher" for survival/accuracy/scores, "neutral" only for purely descriptive metrics.

STEP 5 — MULTI-GROUP, NETWORK, AND COMPLEX DESIGNS:
- For studies with 3+ groups: create SEPARATE outcome rows for each pairwise comparison.
- Include the group names in the outcome name AND in arm1_label/arm2_label.
- For network MA: ensure every direct comparison reported in the paper has its own row.
- For factorial designs: extract each factor comparison separately.
- For dose-response: each dose level vs control is a separate row.

GENERAL RULES:
- Extract from ALL tables, figures, and text — not just the first table.
- Set null ONLY for fields genuinely not reported (not for fields you skipped).
- Cite the source (Table, Figure, or page) for each outcome.
- One row per outcome per comparison. Do NOT merge different outcomes into one row.`;

    const prompt = `Analyze the FULL content of this paper titled "${title}" to extract specific scientific data.

${studyTypeGuidance}

INSTRUCTIONS:
1. Read the ENTIRE text, not just the abstract.
2. For each field, cite where you found the data (e.g. "Methods section, p.4" or "Table 2").
3. Include specific numbers, p-values, confidence intervals, effect sizes.
4. If a field does not apply (e.g. no control group in a descriptive study), write "Not applicable - [reason]".

${structuredOutcomesBlock}`;

    const results = await Promise.allSettled(
        models.map(model => callOpenRouter({ model, prompt, apiKey, pdfBase64, responseSchema: PHASE4_SCHEMA }))
    );

    const extractions: Array<{ model: string; extraction: Record<string, unknown> | null; usage: { prompt_tokens: number; completion_tokens: number; total_cost: number } }> = [];
    let totalCost = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalReportedCost = 0;
    let totalCalculatedCost = 0;

    results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            extractions.push({
                model: result.value.model,
                extraction: result.value.parsed,
                usage: result.value.usage,
            });
            totalCost += result.value.usage.total_cost;
            totalPromptTokens += result.value.usage.prompt_tokens;
            totalCompletionTokens += result.value.usage.completion_tokens;
            totalReportedCost += result.value.usage.reported_cost ?? 0;
            totalCalculatedCost += result.value.usage.calculated_cost ?? 0;
        } else {
            extractions.push({ model: models[i], extraction: null, usage: { prompt_tokens: 0, completion_tokens: 0, total_cost: 0 } });
            console.error(`Phase 4 model ${models[i]} failed:`, result.reason?.message);
        }
    });

    const duration_ms = Date.now() - startTime;

    const phase4Tokens = totalPromptTokens + totalCompletionTokens;
    await updateArticle(articleId, {
        phase4_json: { output: { extractions }, models_used: extractions.map(e => e.model), total_cost: totalCost, duration_ms, timestamp: new Date().toISOString() },
        phase4_status: 'completed',
        phase4_models: extractions.map(e => e.model),
        phase4_cost: totalCost,
        phase4_tokens: phase4Tokens,
        phase4_duration_ms: duration_ms,
        phase4_prompt_tokens: totalPromptTokens,
        phase4_completion_tokens: totalCompletionTokens,
        phase4_completed_at: new Date().toISOString(),
    });

    return {
        output: { extractions },
        cost: totalCost,
        duration_ms,
        tokens: phase4Tokens,
        reported_cost: totalReportedCost,
        calculated_cost: totalCalculatedCost,
    };
}

// ==================== CONFIDENCE SCORING (programmatic) ====================
/** Extract key facts (numbers, percentages, p-values, CIs) from text. */
function extractFacts(text: string): string[] {
    if (!text) return [];
    const facts: string[] = [];

    // Percentages: 86.7%, 92%
    for (const m of text.matchAll(/(\d+\.?\d*)\s*%/g)) facts.push(`${m[1]}%`);

    // P-values: p<0.001, p=0.02, P < .05
    for (const m of text.matchAll(/[Pp]\s*[<>=≤≥]\s*\.?\d+\.?\d*/g)) facts.push(m[0].replace(/\s+/g, '').toLowerCase());

    // AUC/accuracy/sensitivity/specificity with values
    for (const m of text.matchAll(/(?:AUC|accuracy|sensitivity|specificity|precision|recall|F1)[:\s=]*(?:of\s+)?(\d+\.?\d*)/gi)) {
        facts.push(`${m[0].split(/[:\s=]/)[0].toLowerCase()}=${m[1]}`);
    }

    // Confidence intervals: 95% CI [0.40-0.67], (0.55 to 0.77)
    for (const m of text.matchAll(/CI[:\s]*[\[(]?\s*(\d+\.?\d*)\s*[-–to]+\s*(\d+\.?\d*)\s*[\])]?/gi)) {
        facts.push(`CI:${m[1]}-${m[2]}`);
    }

    // Sample sizes: N=46, n=135, N = 50
    for (const m of text.matchAll(/[Nn]\s*=\s*(\d+)/g)) facts.push(`N=${m[1]}`);

    // Standalone numbers (integers >= 2 that could be counts/sizes)
    for (const m of text.matchAll(/\b(\d{2,})\b/g)) {
        const num = m[1];
        if (!facts.some(f => f.includes(num))) facts.push(num);
    }

    return [...new Set(facts)];
}

function calculateConfidenceScores(extractions: Array<{ model?: string; extraction: Record<string, unknown> | null }>): Record<string, unknown> {
    const fields = ['methodology', 'sample_size', 'population', 'intervention', 'control', 'primary_outcomes', 'secondary_outcomes', 'main_results', 'limitations', 'conclusions'];
    const result: Record<string, unknown> = {};

    const validExtractions = extractions.filter(e => e.extraction !== null);
    const modelCount = validExtractions.length;

    if (modelCount < 2) {
        fields.forEach(f => { result[f] = { agreement: modelCount === 1 ? '1/1' : '0/0', score: modelCount === 1 ? 1 : 0, key_facts: [], type: 'insufficient_data' }; });
        return result;
    }

    for (const field of fields) {
        const modelFacts: Array<{ model: string; facts: string[]; text_length: number }> = [];

        for (const ext of validExtractions) {
            const text = String(ext.extraction?.[field] || '');
            modelFacts.push({
                model: (ext as any).model || 'unknown',
                facts: extractFacts(text),
                text_length: text.length,
            });
        }

        const modelsWithContent = modelFacts.filter(m => m.text_length > 10);

        // Collect all facts and count how many models have each
        const factCounts: Record<string, number> = {};
        for (const mf of modelsWithContent) {
            for (const fact of mf.facts) {
                factCounts[fact] = (factCounts[fact] || 0) + 1;
            }
        }

        // Key facts: those found by 2+ models, sorted by frequency
        const keyFacts = Object.entries(factCounts)
            .filter(([, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([fact, count]) => ({ fact, models: count }));

        // Agreement score based on key facts
        let score: number;
        let agreement: string;
        const hasQuantitativeData = keyFacts.length > 0;

        if (hasQuantitativeData) {
            // Weighted average: what fraction of models agree on key facts
            const avgAgreement = keyFacts.reduce((sum, kf) => sum + kf.models, 0) / (keyFacts.length * modelCount);
            score = Math.round(avgAgreement * 100) / 100;
            const agreeingModels = Math.round(avgAgreement * modelCount);
            agreement = `${agreeingModels}/${modelCount}`;
        } else {
            // Qualitative field: all models provided content = agreement, else partial
            score = modelsWithContent.length / modelCount;
            agreement = `${modelsWithContent.length}/${modelCount}`;
        }

        result[field] = {
            agreement,
            score,
            key_facts: keyFacts,
            type: hasQuantitativeData ? 'fact_verified' : 'qualitative',
            models_reporting: modelsWithContent.length,
        };
    }

    return result;
}

// ==================== PHASE 5: Visual Extraction ====================
async function runPhase5(articleId: string, pdfBase64: string, phase1Output: Record<string, unknown>, apiKey: string, configOverride?: PipelineOverride) {
    const startTime = Date.now();

    if (!phase1Output?.has_tables && !phase1Output?.has_figures) {
        const skipJson = { output: { figures: [], tables: [], visual_summary: 'No visual elements detected.', skipped: true }, model: null, duration_ms: 0, timestamp: new Date().toISOString() };
        await updateArticle(articleId, { phase5_json: skipJson, phase5_status: 'completed', phase5_duration_ms: 0, phase5_completed_at: new Date().toISOString() });
        return { output: skipJson.output, cost: 0, duration_ms: 0, tokens: 0, reported_cost: 0, calculated_cost: 0 };
    }

    const model = resolveModel(5, configOverride);

    const prompt = `Analyze all visual elements (figures and tables) in this scientific paper.
Extract ACTUAL data values, not just descriptions. Include exact numbers, p-values, CIs, and percentages.
For tables: tie numeric values explicitly to their column headers and row labels.
For figures: describe trends AND specific data points visible in the image.`;

    const result = await callOpenRouter({ model, prompt, apiKey, pdfBase64, responseSchema: PHASE5_SCHEMA });
    const duration_ms = Date.now() - startTime;

    const phase5Tokens = result.usage.prompt_tokens + result.usage.completion_tokens;
    await updateArticle(articleId, {
        phase5_json: { output: result.parsed, model: result.model, usage: result.usage, duration_ms, timestamp: result.timestamp },
        phase5_status: 'completed',
        phase5_models: [result.model],
        phase5_cost: result.usage.total_cost,
        phase5_tokens: phase5Tokens,
        phase5_duration_ms: duration_ms,
        phase5_prompt_tokens: result.usage.prompt_tokens,
        phase5_completion_tokens: result.usage.completion_tokens,
        phase5_completed_at: result.timestamp,
    });

    return {
        output: result.parsed,
        cost: result.usage.total_cost,
        duration_ms,
        tokens: phase5Tokens,
        reported_cost: result.usage.reported_cost,
        calculated_cost: result.usage.calculated_cost,
    };
}

// ==================== PHASE 6: Consolidation ====================
async function runPhase6(articleId: string, phase4Output: Record<string, unknown>, phase5Output: Record<string, unknown>, apiKey: string, configOverride?: PipelineOverride) {
    const startTime = Date.now();
    const model = resolveModel(6, configOverride);
    const extractions = ((phase4Output as any)?.extractions || []).filter((e: any) => e.extraction !== null);

    if (extractions.length === 0) {
        const fallback = { output: { consolidated: {}, source_count: 0 }, model: null, duration_ms: 0 };
        await updateArticle(articleId, { phase6_json: fallback, phase6_status: 'completed', phase6_duration_ms: 0, phase6_completed_at: new Date().toISOString() });
        return { output: {}, cost: 0, duration_ms: 0, tokens: 0, reported_cost: 0, calculated_cost: 0 };
    }

    const prompt = `You are a Principal Investigator consolidating data from multiple AI analysts.

TEXT EXTRACTIONS (${extractions.length} models):
${extractions.map((e: any, i: number) => `Model ${i + 1} (${e.model}):\n${JSON.stringify(e.extraction, null, 2)}`).join('\n\n')}

VISUAL DATA (Figures & Tables):
${JSON.stringify(phase5Output, null, 2)}

CONSOLIDATION RULES:
1. Numbers disagreement: TRUST TABLE/FIGURE DATA over text extractions.
2. Qualitative disagreement: use majority consensus.
3. Fill every field with the most precise available information.

CRITICAL FORMATTING RULE — CLEAN DATA ONLY:
- The content fields (methodology, sample_size, population, intervention, control, primary_outcomes, secondary_outcomes, main_results, limitations, conclusions, ethical_considerations) must contain ONLY the final consolidated scientific data.
- NEVER prefix or embed agreement ratios like "4/4 agree", "3/4 agree", or any agreement annotation in the content fields.
- Agreement ratios and model comparison details go EXCLUSIVELY in the "field_agreement" object.
- Example of WRONG: "4/4 agree. The study used a randomized design..."
- Example of CORRECT: "The study used a randomized design..." (with field_agreement.methodology = "Full agreement (4/4)")

FIELD_AGREEMENT — MANDATORY (do NOT leave empty):
You MUST fill "field_agreement" with one entry for EACH of these keys: methodology, sample_size, population, intervention, control, primary_outcomes, secondary_outcomes, main_results, limitations, conclusions, ethical_considerations.
- Compare the SPECIFIC NUMBERS and FACTS across models, not just general themes.
- "Full agreement (N/N)" ONLY if all models report the same key numbers and conclusions.
- If models report different numbers (e.g. Model 1 says N=46, Model 2 says N=50), report "3/4 agree on N=46, Model 2 reports N=50".
- If models omit a detail others include, that is NOT full agreement. Report "3/4 provide detail, 1/4 omits".
- Always mention specific discrepancies, not just counts.

STRUCTURED OUTCOMES — CONSOLIDATION:
Each outcome is a DISTINCT METRIC with a specific comparison (e.g. "Dice Score", "Task Duration", "Workload Score").
- Merge the "structured_outcomes" arrays from all models. Use majority consensus; trust table/figure data over text.
- Preserve the new fields from Phase 4: comparison_type (single_arm/pairwise/network), arm1_label, arm2_label, proportion, se_reported, correlation_pre_post, direction_favorable.
- Use arm1_*/arm2_* field naming (NOT intervention_*/control_*).
- For single_arm outcomes: arm2 fields should be null.
- For pairwise/network: ALWAYS fill BOTH arm1 AND arm2 fields when comparison data exists.
- For 3+ group studies: SEPARATE rows per pairwise comparison with group names in arm1_label/arm2_label.
- Do NOT extract system specifications (e.g. "update rate = 1kHz") or table metadata as outcomes.
- DO extract: accuracy metrics, time metrics, error rates, scores, p-values, correlation coefficients, proportions.
- Each study typically has 3-20 distinct outcomes. If you have <3 or >30, reconsider your granularity.
- Set "models_reporting" to how many models reported that specific outcome.
- Set "agreement_note" to describe agreement for each outcome.
- Include ALL outcomes that at least 2 models extracted (or 1 model if it cites a specific table/figure).`;

    const result = await callOpenRouter({ model, prompt, apiKey, responseSchema: PHASE6_SCHEMA, maxTokens: 16000 });
    const duration_ms = Date.now() - startTime;

    if (!result.parsed) {
        await updateArticle(articleId, { phase6_status: 'failed', error_message: `Phase 6 returned null output (model: ${result.model}, tokens: ${result.usage.completion_tokens})` });
        throw new Error(`Phase 6 consolidation returned null (model: ${result.model})`);
    }

    const phase6Tokens = result.usage.prompt_tokens + result.usage.completion_tokens;
    await updateArticle(articleId, {
        phase6_json: { output: { consolidated: result.parsed, source_count: extractions.length }, model: result.model, usage: result.usage, duration_ms, timestamp: result.timestamp },
        phase6_status: 'completed',
        phase6_model: result.model,
        phase6_cost: result.usage.total_cost,
        phase6_tokens: phase6Tokens,
        phase6_duration_ms: duration_ms,
        phase6_prompt_tokens: result.usage.prompt_tokens,
        phase6_completion_tokens: result.usage.completion_tokens,
        phase6_completed_at: result.timestamp,
    });

    return {
        output: result.parsed,
        cost: result.usage.total_cost,
        duration_ms,
        tokens: phase6Tokens,
        reported_cost: result.usage.reported_cost,
        calculated_cost: result.usage.calculated_cost,
    };
}

// ==================== PHASE 7: Final Merge ====================
async function runPhase7(articleId: string, phase3Output: Record<string, unknown>, phase6Output: Record<string, unknown>, confidenceScores: Record<string, unknown>, configOverride?: PipelineOverride) {
    const finalOutput = {
        phase3_consensus: phase3Output || {},
        phase6_scientific: { consolidated: phase6Output || {} },
        confidence_scores: confidenceScores,
        _processing: {
            pipeline_version: PIPELINE_CONFIG.version,
            config_name: configOverride?.name || 'default',
            config_description: configOverride?.description || 'Default production pipeline',
            phases_completed: 7,
            merged_at: new Date().toISOString(),
        },
    };

    await updateArticle(articleId, {
        phase7_json: { output: finalOutput },
        phase7_status: 'completed',
        phase7_duration_ms: 0,
        phase7_completed_at: new Date().toISOString(),
        status: 'completed',
        processing_completed_at: new Date().toISOString(),
    });

    return { output: finalOutput, cost: 0 };
}

// ==================== SINGLE-PHASE HANDLER ====================
async function handleSinglePhase(
    articleId: string,
    phase: number,
    configOverride?: PipelineOverride
): Promise<NextResponse> {
    try {
        if (phase === 1) {
            const { data: claimed, error: claimError } = await supabase
                .from('articles')
                .update({ status: 'processing', current_phase: 0, processing_started_at: new Date().toISOString() })
                .eq('id', articleId)
                .eq('status', 'queued')
                .select('id')
                .single();

            if (claimError || !claimed) {
                const { data: existing } = await supabase.from('articles').select('status').eq('id', articleId).single();
                if (existing?.status === 'processing') {
                    // Allow resume: fall through to run the phase
                } else if (existing?.status === 'completed') {
                    return NextResponse.json({ error: 'Already completed' }, { status: 409 });
                } else {
                    return NextResponse.json({ error: 'Not queued' }, { status: 404 });
                }
            }
        }

        const { data: article, error: fetchErr } = await supabase
            .from('articles').select('*').eq('id', articleId).single();
        if (fetchErr || !article) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

        const userKeys = await getUserKeys(article.user_id);
        const apiKey = userKeys.openrouter_api_key;

        let pdfBase64: string | undefined;
        if ([1, 4, 5].includes(phase)) {
            const signed = await supabase.storage.from('article-pdfs').createSignedUrl(article.pdf_storage_path, 3600);
            if (signed.error || !signed.data?.signedUrl) {
                await updateArticle(articleId, { status: 'failed', error_message: 'Failed to get PDF URL' });
                return NextResponse.json({ error: 'Failed to get PDF URL' }, { status: 500 });
            }
            pdfBase64 = await fetchPdfAsBase64(signed.data.signedUrl);
        }

        await updateArticle(articleId, { current_phase: phase, [`phase${phase}_status`]: 'running' });

        switch (phase) {
            case 1:
                await runPhase1(articleId, pdfBase64!, apiKey, configOverride);
                break;

            case 2:
                await runPhase2(articleId, article.phase1_json?.output, userKeys);
                break;

            case 3:
                await runPhase3(articleId, article.phase1_json?.output, article.phase2_json, apiKey, configOverride);
                break;

            case 4: {
                const p4 = await runPhase4(articleId, pdfBase64!, article.phase3_json?.output, apiKey, configOverride);
                const scores = calculateConfidenceScores(p4.output?.extractions || []);
                await updateArticle(articleId, { confidence_scores: scores });
                break;
            }

            case 5:
                await runPhase5(articleId, pdfBase64!, article.phase1_json?.output, apiKey, configOverride);
                break;

            case 6:
                await runPhase6(articleId, article.phase4_json?.output, article.phase5_json?.output, apiKey, configOverride);
                break;

            case 7: {
                const scores = article.confidence_scores || {};
                const p6Output = article.phase6_json?.output?.consolidated || article.phase6_json?.output;
                await runPhase7(articleId, article.phase3_json?.output, p6Output, scores, configOverride);

                const { data: final } = await supabase.from('articles').select('*').eq('id', articleId).single();
                if (final) {
                    let totalCost = 0, totalTokens = 0, totalDuration = 0;
                    for (let p = 1; p <= 6; p++) {
                        totalCost += Number((final as Record<string, unknown>)[`phase${p}_cost`]) || 0;
                        totalTokens += Number((final as Record<string, unknown>)[`phase${p}_tokens`]) || 0;
                        totalDuration += Number((final as Record<string, unknown>)[`phase${p}_duration_ms`]) || 0;
                    }
                    await updateArticle(articleId, { total_cost: totalCost, total_tokens: totalTokens, total_duration_ms: totalDuration });
                }
                try { await supabase.rpc('increment_articles_processed', { p_user_id: article.user_id }); } catch { /* non-critical */ }
                break;
            }

            default:
                return NextResponse.json({ error: `Invalid phase: ${phase}` }, { status: 400 });
        }

        console.log(`Phase ${phase} completed for ${articleId}`);
        return NextResponse.json({ success: true, articleId, phase });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Phase ${phase} error for ${articleId}:`, message);
        await updateArticle(articleId, {
            status: 'failed',
            error_message: `Phase ${phase}: ${message}`,
            processing_completed_at: new Date().toISOString(),
        });
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ==================== MAIN HANDLER ====================
export async function POST(request: NextRequest) {
    let articleId: string | null = null;

    try {
        const body = await request.json();
        articleId = body.articleId;
        const configName: string | undefined = body.configName;
        const configOverride: PipelineOverride | undefined =
            body.pipelineConfig ||
            (configName && VALIDATION_CONFIGS[configName]) ||
            undefined;

        if (!articleId) return NextResponse.json({ error: 'Missing articleId' }, { status: 400 });

        if (typeof body.phase === 'number') {
            return await handleSinglePhase(articleId, body.phase, configOverride);
        }

        if (configOverride) {
            console.log(`Using pipeline config: ${configOverride.name} — ${configOverride.description}`);
        }

        // Claim the article atomically: only set processing if currently queued (prevents duplicate runs from multiple "Start" clicks)
        const { data: claimed, error: claimError } = await supabase
            .from('articles')
            .update({ status: 'processing', current_phase: 0, processing_started_at: new Date().toISOString() })
            .eq('id', articleId)
            .eq('status', 'queued')
            .select('id')
            .single();

        if (claimError || !claimed) {
            const { data: existing } = await supabase.from('articles').select('status').eq('id', articleId).single();
            if (existing?.status === 'processing') {
                return NextResponse.json({ error: 'Article already being processed' }, { status: 409 });
            }
            if (existing?.status === 'completed') {
                return NextResponse.json({ error: 'Article already completed' }, { status: 409 });
            }
            return NextResponse.json({ error: 'Article not found or not queued' }, { status: 404 });
        }

        const { data: article, error } = await supabase
            .from('articles')
            .select('*')
            .eq('id', articleId)
            .single();

        if (error || !article) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

        const userKeys = await getUserKeys(article.user_id);
        const apiKey = userKeys.openrouter_api_key;

        const signedUrlResult = await supabase.storage.from('article-pdfs').createSignedUrl(article.pdf_storage_path, 3600);
        if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
            await updateArticle(articleId, { status: 'failed', error_message: 'Failed to get PDF URL' });
            return NextResponse.json({ error: 'Failed to get PDF URL' }, { status: 500 });
        }
        const pdfSignedUrl = signedUrlResult.data.signedUrl;

        // Fetch PDF once, reuse across all phases
        console.log('Fetching PDF...');
        const pdfBase64 = await fetchPdfAsBase64(pdfSignedUrl);
        console.log(`PDF cached: ${(pdfBase64.length / 1024 / 1024 * 0.75).toFixed(1)}MB`);

        let totalCost = Number(article.total_cost) || 0;
        let totalDuration = Number(article.total_duration_ms) || 0;
        let totalTokens = Number(article.total_tokens) || 0;
        let totalReportedCost = 0;
        let totalCalculatedCost = 0;

        const canResume = (phase: string) => article[`${phase}_status`] === 'completed' && article[`${phase}_json`];
        const resuming = canResume('phase1') || canResume('phase2') || canResume('phase3') || canResume('phase4');
        if (resuming) console.log('Resuming from last completed phase...');

        // Phase 1
        let p1: any;
        if (canResume('phase1')) {
            p1 = { output: article.phase1_json?.output, cost: 0, duration_ms: 0 };
            console.log('Phase 1: Skipped (cached)');
        } else {
            console.log('Phase 1: Metadata Extraction...');
            await updateArticle(articleId, { current_phase: 1, phase1_status: 'running' });
            p1 = await runPhase1(articleId, pdfBase64, apiKey, configOverride);
            totalCost += p1.cost; totalDuration += p1.duration_ms; totalTokens += p1.tokens ?? 0;
            totalReportedCost += p1.reported_cost ?? 0; totalCalculatedCost += p1.calculated_cost ?? 0;
            console.log(`Phase 1 complete: reported=$${(p1.reported_cost ?? 0).toFixed(4)} | tokens=${p1.tokens ?? 0}`);
        }

        // Phase 2
        let p2: any;
        if (canResume('phase2')) {
            p2 = { output: article.phase2_json || {}, duration_ms: 0 };
            console.log('Phase 2: Skipped (cached)');
        } else {
            console.log('Phase 2: API Enrichment (11 APIs)...');
            await updateArticle(articleId, { current_phase: 2, phase2_status: 'running' });
            p2 = await runPhase2(articleId, p1.output as Record<string, unknown>, userKeys);
            totalDuration += p2.duration_ms;
            console.log('Phase 2 complete: (no LLM cost)');
        }

        // Phase 3
        let p3: any;
        if (canResume('phase3')) {
            p3 = { output: article.phase3_json?.output, cost: 0, duration_ms: 0 };
            console.log('Phase 3: Skipped (cached)');
        } else {
            console.log('Phase 3: Consensus Validation...');
            await updateArticle(articleId, { current_phase: 3, phase3_status: 'running' });
            p3 = await runPhase3(articleId, p1.output as Record<string, unknown>, p2.output, apiKey, configOverride);
            totalCost += p3.cost; totalDuration += p3.duration_ms; totalTokens += p3.tokens ?? 0;
            totalReportedCost += p3.reported_cost ?? 0; totalCalculatedCost += p3.calculated_cost ?? 0;
            console.log(`Phase 3 complete: reported=$${(p3.reported_cost ?? 0).toFixed(4)} | tokens=${p3.tokens ?? 0}`);
        }

        // Phase 4
        let p4: any;
        if (canResume('phase4')) {
            p4 = { output: article.phase4_json?.output, cost: 0, duration_ms: 0 };
            console.log('Phase 4: Skipped (cached)');
        } else {
            const p4Models = resolvePhase4Models(configOverride);
            console.log(`Phase 4: Multi-Model Extraction (${p4Models.length} models)...`);
            await updateArticle(articleId, { current_phase: 4, phase4_status: 'running' });
            p4 = await runPhase4(articleId, pdfBase64, p3.output as Record<string, unknown>, apiKey, configOverride);
            totalCost += p4.cost; totalDuration += p4.duration_ms; totalTokens += p4.tokens ?? 0;
            totalReportedCost += p4.reported_cost ?? 0; totalCalculatedCost += p4.calculated_cost ?? 0;
            console.log(`Phase 4 complete: reported=$${(p4.reported_cost ?? 0).toFixed(4)} | tokens=${p4.tokens ?? 0}`);
        }

        // Confidence Scoring
        console.log('Calculating confidence scores...');
        const confidenceScores = calculateConfidenceScores((p4.output as any).extractions || []);
        await updateArticle(articleId, { confidence_scores: confidenceScores });

        // Phase 5
        let p5: any;
        if (canResume('phase5')) {
            p5 = { output: article.phase5_json?.output, cost: 0, duration_ms: 0 };
            console.log('Phase 5: Skipped (cached)');
        } else {
            console.log('Phase 5: Visual Extraction...');
            await updateArticle(articleId, { current_phase: 5, phase5_status: 'running' });
            p5 = await runPhase5(articleId, pdfBase64, p1.output as Record<string, unknown>, apiKey, configOverride);
            totalCost += p5.cost; totalDuration += p5.duration_ms; totalTokens += p5.tokens ?? 0;
            totalReportedCost += p5.reported_cost ?? 0; totalCalculatedCost += p5.calculated_cost ?? 0;
            console.log(`Phase 5 complete: reported=$${(p5.reported_cost ?? 0).toFixed(4)} | tokens=${p5.tokens ?? 0}`);
        }

        // Phase 6
        console.log('Phase 6: Scientific Consolidation...');
        await updateArticle(articleId, { current_phase: 6, phase6_status: 'running' });
        const p6 = await runPhase6(articleId, p4.output, p5.output as Record<string, unknown>, apiKey, configOverride);
        totalCost += p6.cost; totalDuration += p6.duration_ms; totalTokens += p6.tokens ?? 0;
        totalReportedCost += p6.reported_cost ?? 0; totalCalculatedCost += p6.calculated_cost ?? 0;
        console.log(`Phase 6 complete: reported=$${(p6.reported_cost ?? 0).toFixed(4)} | tokens=${p6.tokens ?? 0}`);

        // Phase 7
        console.log('Phase 7: Final Merge...');
        await updateArticle(articleId, { current_phase: 7, phase7_status: 'running' });
        await runPhase7(articleId, p3.output as Record<string, unknown>, p6.output as Record<string, unknown>, confidenceScores, configOverride);

        // Save totals
        await updateArticle(articleId, {
            total_cost: totalCost,
            total_tokens: totalTokens,
            total_duration_ms: totalDuration,
        });

        // Increment user's monthly counter
        try {
            await supabase.rpc('increment_articles_processed', { p_user_id: article.user_id });
        } catch { /* non-critical */ }

        const configLabel = configOverride?.name || 'default';
        console.log(
            `Pipeline complete [${configLabel}]: reported=$${totalReportedCost.toFixed(4)} | calculated=$${totalCalculatedCost.toFixed(4)} | total_tokens=${totalTokens} | duration=${(totalDuration / 1000).toFixed(1)}s`
        );
        return NextResponse.json({ success: true, articleId, configName: configLabel, totalCost, totalTokens, totalDuration, confidenceScores });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Processing error:', message);
        if (articleId) {
            await updateArticle(articleId, { status: 'failed', error_message: message, processing_completed_at: new Date().toISOString() });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
