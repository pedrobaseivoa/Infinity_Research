/**
 * Phase 3: Consensus with Provenance
 * Creates a Golden Record by consolidating Phase 1 + Phase 2 data
 */

import { callOpenRouter, parseJSON } from '../openrouter'
import type { PipelineContext, Phase1Output, Phase2Output, Phase3Output, PhaseResult } from '../types'

const getPhase3Prompt = (phase1: Phase1Output, phase2: Phase2Output) => `You are a Data Reconciliation Engine. Create a GOLDEN RECORD from multiple sources.

## PROVENANCE NOTATION:
- Use "|" when sources CONFIRM the same value (e.g., "vision|openalex|crossref")
- Use "+" when sources COMPLEMENT with different data (e.g., "openalex+europe_pmc")
- Mark single sources by name (e.g., "europe_pmc")
- Use "none" if no source provided the field

## AVAILABLE DATA SOURCES (11 APIs + vision):
1. vision - PDF extraction (always available)
2. openalex - OpenAlex academic database
3. crossref - Crossref DOI registry
4. europe_pmc - Europe PubMed Central
5. semantic_scholar - Semantic Scholar
6. unpaywall - Open access data
7. pubmed - PubMed/MEDLINE
8. arxiv - ArXiv preprints
9. datacite - DataCite datasets
10. doaj - Directory of Open Access Journals
11. orcid - ORCID author identifiers (credits to "authors" if provides author data)
12. core - CORE aggregator

## CRITICAL: COMPLETE field_sources REQUIRED
You MUST document field_sources for ALL of these fields (no exceptions):
- title, authors, doi, pmid, year, journal, abstract, keywords, citations_count, open_access, publisher
- Even if a field is null or missing, include it in field_sources with "none"
- IMPORTANT: Credit ALL APIs that provided ANY relevant data for each field

## VALIDATION RULES:
1. If API DOI differs from vision DOI, REJECT that API and add to rejected_sources
2. If PMID exists in ANY source, you MUST include it
3. For year conflicts, prefer Crossref (publisher source)
4. For citations, use OpenAlex or Semantic Scholar

## INPUT:

VISION (from PDF - primary):
${JSON.stringify(phase1, null, 2)}

API ENRICHMENT:
${JSON.stringify(phase2, null, 2)}

## OUTPUT FORMAT:
{
  "title": "exact title",
  "authors": ["array"],
  "doi": "10.xxx/xxx",
  "pmid": "12345 or null",
  "abstract": "full text",
  "journal": "name",
  "year": 2024,
  "keywords": ["array"],
  "citations_count": 6,
  "publisher": "name",
  "open_access": true/false/null,
  "orcid_ids": ["if available"],
  "field_sources": {
    "title": "vision|openalex|crossref",
    "authors": "vision|openalex|orcid",
    "pmid": "europe_pmc|pubmed",
    "keywords": "vision+europe_pmc"
  },
  "conflicts_resolved": [
    {"field": "year", "values": {"vision": 2024, "openalex": 2023}, "chosen": 2023, "reason": "OpenAlex official"}
  ],
  "rejected_sources": [
    {"source": "arxiv", "reason": "Title mismatch"}
  ]
}

Return ONLY valid JSON.`

export async function runPhase3(
    ctx: PipelineContext,
    phase1: Phase1Output,
    phase2: Phase2Output
): Promise<PhaseResult<Phase3Output>> {
    const startTime = Date.now()

    await ctx.updateArticle({
        phase3_status: 'running',
        current_phase: 3
    })

    try {
        const result = await callOpenRouter({
            model: 'meta-llama/llama-4-maverick',
            prompt: getPhase3Prompt(phase1, phase2),
            apiKey: ctx.apiKeys.openrouter_api_key
        })

        const output = parseJSON(result.content) as Phase3Output
        const duration_ms = Date.now() - startTime

        await ctx.updateArticle({
            phase3_json: {
                output,
                api_status: phase2._status,
                api_stats: phase2._stats,
                model: result.model,
                usage: result.usage,
                duration_ms,
                timestamp: result.timestamp
            },
            phase3_status: 'completed',
            phase3_model: result.model,
            phase3_cost: result.usage.total_cost,
            phase3_tokens: result.usage.prompt_tokens + result.usage.completion_tokens,
            phase3_duration_ms: duration_ms,
            phase3_prompt_tokens: result.usage.prompt_tokens,
            phase3_completion_tokens: result.usage.completion_tokens,
            phase3_completed_at: result.timestamp
        })

        return {
            output,
            model: result.model,
            usage: result.usage,
            duration_ms,
            timestamp: result.timestamp
        }
    } catch (error: any) {
        await ctx.updateArticle({
            phase3_status: 'failed',
            error_message: `Phase 3 failed: ${error.message}`
        })
        throw error
    }
}
