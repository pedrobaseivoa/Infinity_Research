# Infinity Research — Architecture (v5.0)

## Overview

Infinity Research is a SaaS platform for **automated structured extraction from scientific PDFs**. A user uploads a PDF, and the system runs a 7-phase pipeline that combines LLM-based vision extraction, 11-API bibliographic enrichment, multi-model consensus extraction, programmatic confidence scoring, and deterministic merging — producing a validated golden record per article.

**Model:** BYOK (Bring Your Own Key) — users provide their own OpenRouter API key. Optional keys for Semantic Scholar, OpenAlex, and CORE improve enrichment rate limits.

---

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) + React 19 + React Compiler |
| Database | Supabase (PostgreSQL 17) |
| Auth | Supabase Auth (email/password, cookie-based SSR sessions) |
| Storage | Supabase Storage (bucket: `article-pdfs`) |
| Realtime | Supabase Realtime (postgres_changes on `articles`) |
| LLM Gateway | OpenRouter (`/api/v1/chat/completions`) |
| Edge Functions | Supabase Functions (Deno) — phases 4-6 via `phase-runner` path |
| Styling | Tailwind CSS 4 |
| Charts | Recharts |
| Export | ExcelJS (XLSX), JSON blob |
| Deployment | Vercel + Supabase Cloud |

---

## Directory Structure

```
src/
  app/
    api/
      process-article/route.ts     # Main pipeline (935 lines, phases 1-7)
      process/phase-runner/route.ts # Alternative event-driven orchestrator
      upload/route.ts               # PDF upload → Storage + articles row
      articles/route.ts             # CRUD (list, create)
      articles/[id]/route.ts        # CRUD (get, patch, delete)
      projects/route.ts             # Project CRUD
      folders/route.ts              # Folder CRUD
      export-excel/route.ts         # XLSX export (3 sheets)
      export-json/route.ts          # JSON blob export
      settings/validate-key/route.ts# API key validation
      auth/signout/route.ts         # Sign out
      enrich/route.ts               # Standalone enrichment
      consensus/route.ts            # Standalone consensus
      consolidate-results/route.ts  # Standalone consolidation
      vision/route.ts               # Standalone vision
    dashboard/page.tsx              # Main dashboard
    article/[id]/page.tsx           # Article detail with Realtime
    project/[id]/page.tsx           # Project view with upload + processing
    login/page.tsx                  # Auth
    upload/page.tsx                 # Upload page
    settings/page.tsx               # API key management
    metrics/page.tsx                # Cost/performance analytics
  components/
    ArticlesManager.tsx             # Article/folder navigation
    StatusBadge.tsx                 # Status display
    PdfViewer.tsx                   # Signed URL PDF viewer
    ExportExcelButton.tsx           # Excel download trigger
    ExportJsonButton.tsx            # JSON download trigger
    dashboard/
      DashboardMetrics.tsx          # KPI cards + charts
      ApiHeatmap.tsx                # Phase 2 field coverage heatmap
      QueueProgress.tsx             # Processing queue UI
    ui/
      button.tsx, card.tsx, ...     # shadcn-style primitives
  hooks/
    useProcessingQueue.ts           # Client-side queue driver (MAX_CONCURRENT=3)
  lib/
    processing/
      openrouter-client.ts          # callOpenRouter(), fetchPdfAsBase64(), retry, cost
      models.ts                     # PIPELINE_CONFIG v5.0, model IDs, retry config
      schemas.ts                    # JSON schemas for Phases 1, 3-6
      types.ts                      # Phase1Output..Phase7Output, PipelineContext
      pipeline.ts                   # Modular pipeline (alternative to route.ts)
      phases/phase1..7.ts           # Individual phase modules
      apis/                         # Enrichment API wrappers
    supabase/
      server.ts                     # SSR client (cookies)
      client.ts                     # Browser client
      admin.ts                      # Service role client
    pricing.ts                      # MODEL_PRICES, calculateCost()
    excel-generator.ts              # Excel generation logic
    pdf_service.ts                  # PDF utilities
supabase/
  schema.sql                        # Full DDL (profiles, user_settings, articles)
  schema/database.sql               # Alternative schema (infinity.* namespace)
  schema/v5-migration.sql           # Projects + folders migration
  functions/
    process-phase4/index.ts         # Edge Function for Phase 4
    process-phase5/index.ts         # Edge Function for Phase 5
    process-phase6/index.ts         # Edge Function for Phase 6
    _shared/openrouter.ts           # Shared OpenRouter client for Edge Functions
```

---

## Database Schema

### Core Tables

**`articles`** — One row per uploaded PDF. Stores all pipeline outputs:

| Column Group | Fields |
|-------------|--------|
| Identity | `id` (UUID), `user_id`, `pdf_url`, `pdf_storage_path`, `pdf_filename` |
| Status | `status` (uploaded/processing/completed/failed), `current_phase` (0-7), `error_message` |
| Phase 1 | `phase1_json` (JSONB), `phase1_status`, `phase1_model`, `phase1_cost`, `phase1_tokens`, `phase1_duration_ms`, `phase1_prompt_tokens`, `phase1_completion_tokens`, `phase1_completed_at` |
| Phase 2 | `phase2_json`, `phase2_status`, `phase2_apis_success`, `phase2_apis_failed`, `phase2_duration_ms`, `phase2_completed_at` |
| Phase 3-6 | Same pattern: `phaseN_json`, `phaseN_status`, `phaseN_model`, `phaseN_cost`, `phaseN_tokens`, `phaseN_duration_ms`, ... |
| Phase 7 | `phase7_json`, `phase7_status`, `phase7_duration_ms`, `phase7_completed_at` |
| Totals | `total_cost` (NUMERIC 10,6), `total_tokens`, `total_duration_ms` |
| Timestamps | `processing_started_at`, `processing_completed_at`, `created_at`, `updated_at` |

PostgreSQL trigger `calculate_article_totals` auto-sums `total_cost` and `total_tokens` on every UPDATE.

**`user_settings`** — BYOK API keys + usage limits:
- `openrouter_api_key` (required), `semantic_scholar_api_key`, `openalex_api_key`, `core_api_key`
- `articles_processed_this_month`, `monthly_limit` (default 100)

**`profiles`** — Extension of `auth.users` (email, full_name, avatar_url).

**`processing_jobs`** — Queue/log table (status, current_phase, attempts, logs JSONB).

**`projects`**, **`folders`** — Article organization (added in v5 migration).

All tables use RLS (Row Level Security) scoped to `auth.uid()`.

---

## Pipeline: 7 Phases

### Phase 1: Metadata Extraction
- **Model:** `openai/gpt-4o`
- **Input:** PDF as base64 via OpenRouter `file-parser` plugin (`pdf-text` engine)
- **Output:** `Phase1Output` — title, authors, DOI, abstract, journal, year, keywords, study_type (enum: RCT, Cohort, Case-Control, Cross-Sectional, Systematic Review, Meta-Analysis, etc.), has_tables, has_figures, estimated_pages, funding_sources, conflict_of_interest, registration_number
- **Schema enforcement:** `response_format: { type: "json_schema", json_schema: PHASE1_SCHEMA }`

### Phase 2: 11-API Enrichment
- **Model:** None (HTTP only)
- **APIs:** PubMed, OpenAlex, CrossRef, Semantic Scholar, Europe PMC, arXiv, DataCite, Unpaywall, DOAJ, ORCID, CORE
- **Execution:** `Promise.allSettled()` — all 11 in parallel
- **Output:** Raw API responses + `_status` (per-API success/error) + `_stats` (success count, elapsed_ms) + `_field_coverage` (which fields each API contributed)
- **Cost:** $0 (free APIs)

### Phase 3: Consensus Validation
- **Model:** `meta-llama/llama-4-maverick`
- **Input:** Phase 1 output + Phase 2 output (text-only, no PDF)
- **Output:** Golden Record with `field_sources` provenance (e.g., `"doi": "vision|crossref|openalex"`), `conflicts_resolved` (field, chosen value, reason), `rejected_sources` (source, reason)
- **Logic:** DOI mismatch → reject API, PMID inclusion from any source, year conflicts prefer CrossRef, citations prefer OpenAlex/Semantic Scholar

### Phase 4: Multi-Model Extraction
- **Models:** 4 in parallel via `Promise.allSettled()`:
  - `google/gemini-3-flash-preview`
  - `anthropic/claude-haiku-4.5`
  - `openai/gpt-4.1-mini`
  - `x-ai/grok-4.1-fast`
- **Input:** PDF base64 + study-type-specific guidance (RCT → PICO/randomization; observational → confounders; SR/MA → search strategy/quality assessment)
- **Output:** Array of `{ model, extraction: Phase4Extraction }` — methodology, sample_size, population, intervention, control, primary_outcomes, secondary_outcomes, main_results, limitations, conclusions, ethical_considerations

### Confidence Scoring (between Phase 4 and 5)
- **Model:** None (programmatic)
- **Algorithm:** `extractFacts()` uses regex to pull quantitative facts (percentages, p-values, CIs, sample sizes, AUC/accuracy/sensitivity) from each model's text. Agreement ratio computed per field: how many models report the same key facts.
- **Output:** Per-field `{ agreement, score (0-1), key_facts, type (fact_verified|qualitative), models_reporting }`

### Phase 5: Visual Extraction (conditional)
- **Condition:** Runs only if `phase1.has_tables || phase1.has_figures`
- **Model:** `google/gemini-3.1-pro-preview`
- **Input:** PDF base64
- **Output:** `{ figures[], tables[], visual_summary }` — actual data values from figures/tables, not just descriptions

### Phase 6: Scientific Consolidation
- **Model:** `deepseek/deepseek-v3.2`
- **Input:** Phase 4 extractions (all models) + Phase 5 visual data (text-only)
- **Output:** Single consolidated record with `field_agreement` per field. Rule: table/figure data trusted over text; majority consensus for qualitative; specific discrepancies documented.

### Phase 7: Final Merge (deterministic)
- **Model:** None (JS code)
- **Output:** `{ phase3_consensus, phase6_scientific: { consolidated }, confidence_scores, _processing: { pipeline_version, phases_completed, merged_at } }`
- Marks `articles.status = 'completed'`

---

## LLM Integration

All LLM calls go through **OpenRouter** (`https://openrouter.ai/api/v1/chat/completions`) using the user's API key.

**Client:** `src/lib/processing/openrouter-client.ts`
- `callOpenRouter({ model, prompt, apiKey, pdfBase64?, responseSchema? })` → `{ parsed, model, usage, timestamp }`
- PDF attachment via `file-parser` plugin with `pdf-text` engine
- Structured output via `response_format: { type: "json_schema", json_schema }`
- Retry: 3 attempts with delays [2s, 4s, 8s]
- Dual cost tracking: `reported_cost` (from OpenRouter API/generation endpoint) vs `calculated_cost` (local `MODEL_PRICING` × token counts)

---

## Data Flow

```
Upload PDF → Supabase Storage → articles row (status: queued)
                                        ↓
useProcessingQueue hook → POST /api/process-article { articleId }
                                        ↓
Claim (atomic: queued → processing) → Fetch PDF as base64
    ↓
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Confidence → Phase 5 → Phase 6 → Phase 7
    ↓         ↓         ↓         ↓          ↓           ↓         ↓         ↓
  phaseN_json saved to articles row after each phase (JSONB)
                                        ↓
articles.status = completed → total_cost/tokens/duration saved
                                        ↓
UI: article-view.tsx / project/[id]/page.tsx (Realtime subscription)
Export: /api/export-excel, /api/export-json
```

---

## Cost Tracking

| Level | Mechanism |
|-------|-----------|
| Per-call | `openrouter-client.ts` logs reported vs calculated cost |
| Per-phase | `phaseN_cost` (NUMERIC 10,6) in articles table |
| Per-article | `total_cost` auto-computed by PostgreSQL trigger |
| Per-user | `increment_articles_processed` RPC increments monthly counter |
| UI | DashboardMetrics, QueueProgress (estimated cost), Visual & Costs sheet in Excel |

---

## Export Formats

**Excel** (3 sheets):
1. **Scientific Data** — 22 columns: metadata (title, authors, DOI, PMID, year, journal, keywords, abstract, open_access, citations) + extraction (methodology through consolidation_notes)
2. **Visual & Costs** — 15 columns: has_figures/tables, model + cost per phase, total cost
3. **Performance** — 12 columns: duration per phase, prompt/completion/total tokens

**JSON** — Full article data blob download.

---

## Known Architectural Notes

1. Two pipeline paths coexist: `process-article/route.ts` (monolithic, self-contained) and `pipeline.ts + phase-runner + Edge Functions` (modular, event-driven). The monolithic path is the primary one used in production.
2. Processing runs in a single HTTP request (`maxDuration=300s`). No server-side job queue.
3. Queue is client-side (`useProcessingQueue` hook, MAX_CONCURRENT=3). If browser closes, queue stops.
4. `src/proxy.ts` contains middleware logic but is not wired as `src/middleware.ts`. Auth protection is per-page via `getUser()` + redirect.
5. No automated tests. No structured logging. No APM/error monitoring.
6. `monthly_limit` exists in schema but is not enforced in code.
