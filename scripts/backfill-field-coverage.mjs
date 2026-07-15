/**
 * One-off script: Compute _field_coverage retroactively from existing Phase 2 raw data.
 * No API calls needed — just reads phase2_json and extracts which fields each API returned.
 *
 * Usage: node --env-file=.env.local scripts/backfill-field-coverage.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local scripts/backfill-field-coverage.mjs');
    process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

function has(obj, ...keys) {
    return keys.some(k => {
        const v = obj?.[k];
        if (v === null || v === undefined) return false;
        if (typeof v === 'string') return v.trim().length > 0;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'number') return true;
        if (typeof v === 'boolean') return true;
        return !!v;
    });
}

function computeFieldCoverage(apis) {
    const coverage = {};

    if (apis.pubmed) {
        coverage.pubmed = ['pmid'];
    }

    const oa = apis.openalex;
    if (oa) {
        const fields = [];
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

    const cr = apis.crossref;
    if (cr) {
        const fields = [];
        if (has(cr, 'title')) fields.push('title');
        if (has(cr, 'author')) fields.push('authors');
        if (has(cr, 'DOI')) fields.push('doi');
        if (cr?.issued?.['date-parts']?.[0]?.[0] || cr?.published?.['date-parts']?.[0]?.[0]) fields.push('year');
        if (has(cr, 'container-title')) fields.push('journal');
        if (has(cr, 'abstract')) fields.push('abstract');
        if (has(cr, 'is-referenced-by-count')) fields.push('citations');
        if (fields.length) coverage.crossref = fields;
    }

    const ss = apis.semantic_scholar;
    if (ss) {
        const fields = [];
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

    const ep = apis.europe_pmc;
    if (ep) {
        const fields = [];
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

    const ax = apis.arxiv;
    if (ax) {
        const fields = [];
        if (has(ax, 'title')) fields.push('title');
        if (has(ax, 'authors')) fields.push('authors');
        if (has(ax, 'abstract')) fields.push('abstract');
        if (has(ax, 'published')) fields.push('year');
        if (has(ax, 'arxiv_id')) fields.push('doi');
        if (fields.length) coverage.arxiv = fields;
    }

    const dc = apis.datacite;
    if (dc) {
        const attrs = dc?.attributes || dc;
        const fields = [];
        if (has(attrs, 'titles')) fields.push('title');
        if (has(attrs, 'creators')) fields.push('authors');
        if (has(attrs, 'doi')) fields.push('doi');
        if (has(attrs, 'publicationYear')) fields.push('year');
        if (fields.length) coverage.datacite = fields;
    }

    const uw = apis.unpaywall;
    if (uw) {
        const fields = [];
        if (has(uw, 'title')) fields.push('title');
        if (has(uw, 'doi')) fields.push('doi');
        if (has(uw, 'year')) fields.push('year');
        if (has(uw, 'journal_name')) fields.push('journal');
        if (has(uw, 'z_authors')) fields.push('authors');
        if (uw?.is_oa !== undefined) fields.push('open_access');
        if (fields.length) coverage.unpaywall = fields;
    }

    const dj = apis.doaj;
    if (dj) {
        const bib = dj?.bibjson || dj;
        const fields = [];
        if (has(bib, 'title')) fields.push('title');
        if (has(bib, 'author')) fields.push('authors');
        if (bib?.identifier?.some(i => i.type === 'doi')) fields.push('doi');
        if (has(bib, 'journal')) fields.push('journal');
        if (has(bib, 'year')) fields.push('year');
        if (fields.length) coverage.doaj = fields;
    }

    const or = apis.orcid;
    if (or && Array.isArray(or) && or.length > 0) {
        coverage.orcid = ['orcid_ids'];
    }

    const co = apis.core;
    if (co) {
        const fields = [];
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

async function main() {
    console.log('=== Backfill _field_coverage ===\n');

    const { data: articles, error } = await sb.from('articles')
        .select('id, pdf_filename, phase2_json')
        .eq('status', 'completed')
        .order('created_at', { ascending: true });

    if (error) { console.error('DB error:', error); return; }

    console.log(`Found ${articles.length} completed articles.\n`);

    let updated = 0;

    for (const article of articles) {
        const p2 = article.phase2_json;
        if (!p2) { console.log(`[SKIP] ${article.pdf_filename} — no phase2_json`); continue; }

        const coverage = computeFieldCoverage(p2);
        const apiCount = Object.keys(coverage).length;
        const fieldCount = Object.values(coverage).reduce((sum, f) => sum + f.length, 0);

        // Merge _field_coverage into existing phase2_json
        const updatedP2 = { ...p2, _field_coverage: coverage };

        await sb.from('articles').update({ phase2_json: updatedP2 }).eq('id', article.id);

        updated++;
        const shortName = (article.pdf_filename || article.id).substring(0, 55);
        console.log(`[${updated}/${articles.length}] ${shortName} — ${apiCount} APIs, ${fieldCount} fields`);
    }

    console.log(`\n=== Done: ${updated} articles updated ===`);
}

main().catch(console.error);
