/**
 * Validation Analysis Script
 *
 * Reads processed articles from Supabase, extracts Phase 4 individual model
 * outputs, computes inter-model agreement, and generates comparison tables
 * across pipeline configurations (A/B/C/D).
 *
 * Usage:
 *   npx tsx scripts/analyze-validation.ts
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhaseResult {
  model?: string;
  extraction: Record<string, string> | null;
  usage?: { prompt_tokens: number; completion_tokens: number; total_cost: number };
}

interface ArticleRow {
  id: string;
  pdf_filename: string;
  status: string;
  phase1_json: any;
  phase2_json: any;
  phase3_json: any;
  phase4_json: any;
  phase5_json: any;
  phase6_json: any;
  phase7_json: any;
  phase1_cost: number;
  phase3_cost: number;
  phase4_cost: number;
  phase5_cost: number;
  phase6_cost: number;
  total_cost: number;
  total_tokens: number;
  total_duration_ms: number;
  phase1_duration_ms: number;
  phase2_duration_ms: number;
  phase3_duration_ms: number;
  phase4_duration_ms: number;
  phase5_duration_ms: number;
  phase6_duration_ms: number;
  confidence_scores: Record<string, any>;
}

const SCIENTIFIC_FIELDS = [
  'methodology', 'sample_size', 'population', 'intervention', 'control',
  'primary_outcomes', 'secondary_outcomes', 'main_results', 'limitations', 'conclusions',
];

const METADATA_FIELDS = ['title', 'authors', 'doi', 'journal', 'year', 'pmid', 'study_type'];

// ---------------------------------------------------------------------------
// Fact extraction (same algorithm as pipeline confidence scoring)
// ---------------------------------------------------------------------------

function extractFacts(text: string): string[] {
  if (!text) return [];
  const facts: string[] = [];
  for (const m of text.matchAll(/(\d+\.?\d*)\s*%/g)) facts.push(`${m[1]}%`);
  for (const m of text.matchAll(/[Pp]\s*[<>=≤≥]\s*\.?\d+\.?\d*/g)) facts.push(m[0].replace(/\s+/g, '').toLowerCase());
  for (const m of text.matchAll(/(?:AUC|accuracy|sensitivity|specificity|precision|recall|F1)[:\s=]*(?:of\s+)?(\d+\.?\d*)/gi))
    facts.push(`${m[0].split(/[:\s=]/)[0].toLowerCase()}=${m[1]}`);
  for (const m of text.matchAll(/CI[:\s]*[\[(]?\s*(\d+\.?\d*)\s*[-–to]+\s*(\d+\.?\d*)\s*[\])]?/gi))
    facts.push(`CI:${m[1]}-${m[2]}`);
  for (const m of text.matchAll(/[Nn]\s*=\s*(\d+)/g)) facts.push(`N=${m[1]}`);
  return [...new Set(facts)];
}

// ---------------------------------------------------------------------------
// Inter-model agreement
// ---------------------------------------------------------------------------

function computePairwiseAgreement(extractions: PhaseResult[]): Record<string, { pairs: number; agreed: number; kappa: number }> {
  const valid = extractions.filter(e => e.extraction !== null);
  if (valid.length < 2) return {};

  const result: Record<string, { pairs: number; agreed: number; kappa: number }> = {};

  for (const field of SCIENTIFIC_FIELDS) {
    let totalPairs = 0;
    let agreedPairs = 0;

    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        totalPairs++;
        const factsI = extractFacts(String(valid[i].extraction?.[field] || ''));
        const factsJ = extractFacts(String(valid[j].extraction?.[field] || ''));

        if (factsI.length === 0 && factsJ.length === 0) {
          agreedPairs++;
          continue;
        }
        if (factsI.length === 0 || factsJ.length === 0) continue;

        const setI = new Set(factsI);
        const intersection = factsJ.filter(f => setI.has(f)).length;
        const union = new Set([...factsI, ...factsJ]).size;
        if (union > 0 && intersection / union >= 0.5) agreedPairs++;
      }
    }

    const po = totalPairs > 0 ? agreedPairs / totalPairs : 0;
    const pe = 0.5;
    const kappa = pe < 1 ? (po - pe) / (1 - pe) : 0;

    result[field] = { pairs: totalPairs, agreed: agreedPairs, kappa: Math.round(kappa * 1000) / 1000 };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Enrichment correction analysis
// ---------------------------------------------------------------------------

function analyzeEnrichmentValue(article: ArticleRow): Record<string, { phase1: string; phase3: string; corrected: boolean }> {
  const p1 = article.phase1_json?.output || {};
  const p3 = article.phase3_json?.output || article.phase7_json?.output?.phase3_consensus || {};
  const corrections: Record<string, { phase1: string; phase3: string; corrected: boolean }> = {};

  for (const field of ['doi', 'year', 'journal', 'pmid']) {
    const v1 = String(p1[field] ?? '').trim();
    const v3 = String(p3[field] ?? '').trim();
    const corrected = v1 !== v3 && v3.length > 0;
    corrections[field] = { phase1: v1, phase3: v3, corrected };
  }

  return corrections;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error('Usage: npx tsx scripts/analyze-validation.ts <user_id>');
    console.error('  Pass the user_id of the validation test account.');
    process.exit(1);
  }

  console.log(`Fetching completed articles for user ${userId}...`);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: true });

  if (error || !articles?.length) {
    console.error('No completed articles found:', error?.message);
    process.exit(1);
  }

  console.log(`Found ${articles.length} completed articles.\n`);

  // Group articles by config name
  const byConfig: Record<string, ArticleRow[]> = {};
  for (const a of articles as ArticleRow[]) {
    const configName = a.phase7_json?.output?._processing?.config_name || 'default';
    if (!byConfig[configName]) byConfig[configName] = [];
    byConfig[configName].push(a);
  }

  console.log('Configs found:', Object.keys(byConfig).join(', '));
  console.log('');

  // ---- Per-config analysis ----
  for (const [configName, configArticles] of Object.entries(byConfig)) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`CONFIG: ${configName} (${configArticles.length} articles)`);
    console.log('='.repeat(70));

    // Cost summary
    const costs = configArticles.map(a => Number(a.total_cost) || 0);
    const totalCost = costs.reduce((s, c) => s + c, 0);
    const meanCost = totalCost / costs.length;
    console.log(`\nCost: total=$${totalCost.toFixed(4)} | mean=$${meanCost.toFixed(4)} | min=$${Math.min(...costs).toFixed(4)} | max=$${Math.max(...costs).toFixed(4)}`);

    // Duration summary
    const durations = configArticles.map(a => (Number(a.total_duration_ms) || 0) / 1000);
    const meanDuration = durations.reduce((s, d) => s + d, 0) / durations.length;
    console.log(`Duration: mean=${meanDuration.toFixed(1)}s | min=${Math.min(...durations).toFixed(1)}s | max=${Math.max(...durations).toFixed(1)}s`);

    // Token summary
    const tokens = configArticles.map(a => Number(a.total_tokens) || 0);
    const meanTokens = tokens.reduce((s, t) => s + t, 0) / tokens.length;
    console.log(`Tokens: mean=${Math.round(meanTokens)} | total=${tokens.reduce((s, t) => s + t, 0)}`);

    // Phase cost breakdown
    console.log('\nCost by phase:');
    for (const phase of [1, 3, 4, 5, 6] as const) {
      const phaseCosts = configArticles.map(a => Number((a as any)[`phase${phase}_cost`]) || 0);
      const phaseTotal = phaseCosts.reduce((s, c) => s + c, 0);
      const phasePct = totalCost > 0 ? (phaseTotal / totalCost * 100).toFixed(1) : '0';
      console.log(`  Phase ${phase}: $${phaseTotal.toFixed(4)} (${phasePct}%)`);
    }

    // Inter-model agreement (Phase 4)
    console.log('\nInter-model agreement (Phase 4):');
    const allAgreements: Record<string, number[]> = {};
    for (const a of configArticles) {
      const extractions: PhaseResult[] = a.phase4_json?.output?.extractions || [];
      if (extractions.length < 2) {
        console.log(`  ${a.pdf_filename}: single model — skipping agreement`);
        continue;
      }
      const agreement = computePairwiseAgreement(extractions);
      console.log(`  ${a.pdf_filename} (${extractions.length} models):`);
      for (const [field, stats] of Object.entries(agreement)) {
        if (!allAgreements[field]) allAgreements[field] = [];
        allAgreements[field].push(stats.kappa);
        console.log(`    ${field}: ${stats.agreed}/${stats.pairs} pairs agree (κ=${stats.kappa})`);
      }
    }

    if (Object.keys(allAgreements).length > 0) {
      console.log('\n  Mean agreement across articles:');
      for (const [field, kappas] of Object.entries(allAgreements)) {
        const mean = kappas.reduce((s, k) => s + k, 0) / kappas.length;
        console.log(`    ${field}: mean κ=${mean.toFixed(3)}`);
      }
    }

    // Enrichment corrections
    console.log('\nEnrichment corrections (Phase 1 → Phase 3):');
    let totalCorrections = 0;
    let totalFields = 0;
    for (const a of configArticles) {
      const corrections = analyzeEnrichmentValue(a);
      const corrected = Object.values(corrections).filter(c => c.corrected).length;
      totalCorrections += corrected;
      totalFields += Object.keys(corrections).length;
      if (corrected > 0) {
        console.log(`  ${a.pdf_filename}: ${corrected} corrections`);
        for (const [field, c] of Object.entries(corrections)) {
          if (c.corrected) console.log(`    ${field}: "${c.phase1}" → "${c.phase3}"`);
        }
      }
    }
    console.log(`  Total: ${totalCorrections}/${totalFields} fields corrected (${(totalCorrections / totalFields * 100).toFixed(1)}%)`);

    // Confidence scores summary
    console.log('\nConfidence scores (from pipeline):');
    const allScores: Record<string, number[]> = {};
    for (const a of configArticles) {
      const scores = a.confidence_scores || {};
      for (const [field, data] of Object.entries(scores)) {
        if (!allScores[field]) allScores[field] = [];
        allScores[field].push((data as any).score || 0);
      }
    }
    for (const [field, scores] of Object.entries(allScores)) {
      const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
      console.log(`  ${field}: mean=${mean.toFixed(3)} (n=${scores.length})`);
    }
  }

  // ---- Cross-config comparison ----
  if (Object.keys(byConfig).length > 1) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('CROSS-CONFIG COMPARISON');
    console.log('='.repeat(70));

    console.log('\n| Config | Articles | Mean Cost | Mean Duration | Mean Tokens |');
    console.log('|--------|----------|-----------|---------------|-------------|');
    for (const [name, arts] of Object.entries(byConfig)) {
      const mc = (arts.reduce((s, a) => s + (Number(a.total_cost) || 0), 0) / arts.length).toFixed(4);
      const md = (arts.reduce((s, a) => s + (Number(a.total_duration_ms) || 0), 0) / arts.length / 1000).toFixed(1);
      const mt = Math.round(arts.reduce((s, a) => s + (Number(a.total_tokens) || 0), 0) / arts.length);
      console.log(`| ${name.padEnd(6)} | ${String(arts.length).padEnd(8)} | $${mc.padEnd(9)} | ${md.padEnd(13)}s | ${String(mt).padEnd(11)} |`);
    }
  }

  // ---- Export raw data for external analysis ----
  const outputPath = path.resolve(__dirname, 'validation-results.json');
  const exportData: Record<string, any[]> = {};
  for (const [name, arts] of Object.entries(byConfig)) {
    exportData[name] = arts.map(a => ({
      id: a.id,
      filename: a.pdf_filename,
      config: a.phase7_json?.output?._processing?.config_name,
      total_cost: Number(a.total_cost),
      total_tokens: Number(a.total_tokens),
      total_duration_ms: Number(a.total_duration_ms),
      phase_costs: {
        p1: Number(a.phase1_cost), p3: Number(a.phase3_cost),
        p4: Number(a.phase4_cost), p5: Number(a.phase5_cost), p6: Number(a.phase6_cost),
      },
      phase_durations: {
        p1: a.phase1_duration_ms, p2: a.phase2_duration_ms, p3: a.phase3_duration_ms,
        p4: a.phase4_duration_ms, p5: a.phase5_duration_ms, p6: a.phase6_duration_ms,
      },
      p4_models: (a.phase4_json?.output?.extractions || []).map((e: any) => e.model),
      p4_model_count: (a.phase4_json?.output?.extractions || []).filter((e: any) => e.extraction).length,
      confidence_scores: a.confidence_scores,
      enrichment_stats: a.phase2_json?._stats,
    }));
  }
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`\nRaw data exported to: ${outputPath}`);
}

main().catch(console.error);
