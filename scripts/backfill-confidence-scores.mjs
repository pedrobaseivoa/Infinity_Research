/**
 * One-off script: Recompute confidence_scores from Phase 4 extractions
 * using fact-based agreement instead of Jaccard similarity.
 *
 * No API calls — just reads phase4_json and computes locally.
 *
 * Usage: node --env-file=.env.local scripts/backfill-confidence-scores.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local scripts/backfill-confidence-scores.mjs');
    process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

function extractFacts(text) {
    if (!text) return [];
    const facts = [];

    for (const m of text.matchAll(/(\d+\.?\d*)\s*%/g)) facts.push(`${m[1]}%`);
    for (const m of text.matchAll(/[Pp]\s*[<>=≤≥]\s*\.?\d+\.?\d*/g)) facts.push(m[0].replace(/\s+/g, '').toLowerCase());
    for (const m of text.matchAll(/(?:AUC|accuracy|sensitivity|specificity|precision|recall|F1)[:\s=]*(?:of\s+)?(\d+\.?\d*)/gi)) {
        facts.push(`${m[0].split(/[:\s=]/)[0].toLowerCase()}=${m[1]}`);
    }
    for (const m of text.matchAll(/CI[:\s]*[\[(]?\s*(\d+\.?\d*)\s*[-–to]+\s*(\d+\.?\d*)\s*[\])]?/gi)) {
        facts.push(`CI:${m[1]}-${m[2]}`);
    }
    for (const m of text.matchAll(/[Nn]\s*=\s*(\d+)/g)) facts.push(`N=${m[1]}`);
    for (const m of text.matchAll(/\b(\d{2,})\b/g)) {
        const num = m[1];
        if (!facts.some(f => f.includes(num))) facts.push(num);
    }

    return [...new Set(facts)];
}

function calculateConfidenceScores(extractions) {
    const fields = ['methodology', 'sample_size', 'population', 'intervention', 'control', 'primary_outcomes', 'secondary_outcomes', 'main_results', 'limitations', 'conclusions'];
    const result = {};

    const validExtractions = extractions.filter(e => e.extraction !== null);
    const modelCount = validExtractions.length;

    if (modelCount < 2) {
        fields.forEach(f => { result[f] = { agreement: modelCount === 1 ? '1/1' : '0/0', score: modelCount === 1 ? 1 : 0, key_facts: [], type: 'insufficient_data' }; });
        return result;
    }

    for (const field of fields) {
        const modelFacts = [];

        for (const ext of validExtractions) {
            const text = String(ext.extraction?.[field] || '');
            modelFacts.push({
                model: ext.model || 'unknown',
                facts: extractFacts(text),
                text_length: text.length,
            });
        }

        const modelsWithContent = modelFacts.filter(m => m.text_length > 10);

        const factCounts = {};
        for (const mf of modelsWithContent) {
            for (const fact of mf.facts) {
                factCounts[fact] = (factCounts[fact] || 0) + 1;
            }
        }

        const keyFacts = Object.entries(factCounts)
            .filter(([, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([fact, count]) => ({ fact, models: count }));

        let score, agreement;
        const hasQuantitativeData = keyFacts.length > 0;

        if (hasQuantitativeData) {
            const avgAgreement = keyFacts.reduce((sum, kf) => sum + kf.models, 0) / (keyFacts.length * modelCount);
            score = Math.round(avgAgreement * 100) / 100;
            const agreeingModels = Math.round(avgAgreement * modelCount);
            agreement = `${agreeingModels}/${modelCount}`;
        } else {
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

async function main() {
    console.log('=== Backfill Confidence Scores (Fact-Based) ===\n');

    const { data: articles, error } = await sb.from('articles')
        .select('id, pdf_filename, phase4_json, phase7_json, confidence_scores')
        .eq('status', 'completed')
        .order('created_at', { ascending: true });

    if (error) { console.error('DB error:', error); return; }

    console.log(`Found ${articles.length} completed articles.\n`);

    let updated = 0;

    for (const article of articles) {
        const shortName = (article.pdf_filename || article.id).substring(0, 55);
        const extractions = article.phase4_json?.extractions || article.phase4_json?.output?.extractions || [];

        if (extractions.length === 0) {
            console.log(`[SKIP] ${shortName} — no Phase 4 extractions`);
            continue;
        }

        const newScores = calculateConfidenceScores(extractions);

        // Update phase7_json with new confidence_scores
        const phase7 = article.phase7_json || {};
        const phase7Output = phase7.output || {};
        phase7Output.confidence_scores = newScores;
        phase7.output = phase7Output;

        await sb.from('articles').update({
            confidence_scores: newScores,
            phase7_json: phase7,
        }).eq('id', article.id);

        updated++;

        // Show a sample of key facts for first few
        const sampleField = newScores.sample_size || newScores.primary_outcomes;
        const factsPreview = sampleField?.key_facts?.slice(0, 3).map(f => f.fact).join(', ') || 'qualitative';
        console.log(`[${updated}/${articles.length}] ${shortName} — ${sampleField?.agreement || '?'} (${factsPreview})`);
    }

    console.log(`\n=== Done: ${updated} articles updated ===`);
}

main().catch(console.error);
