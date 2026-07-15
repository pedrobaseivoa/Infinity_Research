# Infinity Research — Validation Protocol

## Study Design

**Objective:** Validate the multi-model consensus extraction pipeline by comparing 4 pipeline configurations across 10 scientific articles, measuring inter-model agreement, extraction accuracy vs human verification, and cost-accuracy tradeoffs.

**Research questions:**
1. Does multi-model extraction (4 models) outperform single-model extraction?
2. Does model diversity (different providers) matter?
3. Can budget models achieve comparable quality to premium models when used in ensemble?
4. Does OpenRouter Auto routing make appropriate model selections?

---

## Sample Selection

**N = 10 articles** selected from the study corpus, stratified by:

| Criterion | Target |
|-----------|--------|
| Study types | 2-3 RCTs, 2-3 observational, 2-3 reviews/meta-analyses, 1-2 methodology |
| Complexity | Mix of simple (no tables/figures) and complex (multiple tables + figures) |
| Length | Short (<8 pages) to long (>15 pages) |
| Cost variance | Include articles that were cheap and expensive in previous runs |

---

## Pipeline Configurations

### Run A — Current Default (Baseline)

Establishes the benchmark with the current production configuration.

```json
{
  "name": "A_baseline",
  "description": "Current production pipeline (v5.0)",
  "phases": {
    "1": { "model": "openai/gpt-4o" },
    "3": { "model": "meta-llama/llama-4-maverick" },
    "4": { "models": ["google/gemini-3-flash-preview", "anthropic/claude-haiku-4.5", "openai/gpt-4.1-mini", "x-ai/grok-4.1-fast"] },
    "5": { "model": "google/gemini-3.1-pro-preview" },
    "6": { "model": "deepseek/deepseek-v3.2" }
  }
}
```

**Estimated cost:** ~$0.25/article → ~$2.50 total

### Run B — Single Model (Architecture Ablation)

Tests the null hypothesis: "You don't need multi-model; one good model is enough."
Uses Gemini 3 Flash Preview (#1 in Academia on OpenRouter) for ALL phases.

```json
{
  "name": "B_single_model",
  "description": "Single model (Gemini 3 Flash) for all phases — architecture ablation",
  "phases": {
    "1": { "model": "google/gemini-3-flash-preview" },
    "3": { "model": "google/gemini-3-flash-preview" },
    "4": { "models": ["google/gemini-3-flash-preview"] },
    "5": { "model": "google/gemini-3-flash-preview" },
    "6": { "model": "google/gemini-3-flash-preview" }
  }
}
```

**Estimated cost:** ~$0.12/article → ~$1.20 total

### Run C — Next-Gen + Auto (Future Models + Intelligent Routing)

Tests newer models (2025-2026 generation) and OpenRouter Auto routing.

```json
{
  "name": "C_nextgen_auto",
  "description": "Next-gen models + OpenRouter Auto in P3, P4 (1 slot), P6",
  "phases": {
    "1": { "model": "google/gemini-3-flash-preview" },
    "3": { "model": "openrouter/auto" },
    "4": { "models": ["google/gemini-2.5-flash", "openai/gpt-5-mini", "google/gemini-3.1-flash-lite-preview", "openrouter/auto"] },
    "5": { "model": "google/gemini-3.1-pro-preview" },
    "6": { "model": "openrouter/auto" }
  }
}
```

**Estimated cost:** ~$0.20-0.30/article → ~$2.00-3.00 total
**Bonus data:** OpenRouter Auto response header reveals which model was selected — log this.

### Run D — Budget Ensemble (Architecture > Model Quality)

Tests the thesis: "4 cheap models agreeing > 1 expensive model alone."
If D ≥ B in accuracy, this proves the architecture matters more than individual model quality.

```json
{
  "name": "D_budget_ensemble",
  "description": "4 budget models — tests if architecture compensates for model quality",
  "phases": {
    "1": { "model": "google/gemini-2.5-flash-lite" },
    "3": { "model": "deepseek/deepseek-v3.2" },
    "4": { "models": ["google/gemini-2.5-flash-lite", "openai/gpt-4o-mini", "openai/gpt-5-nano", "openrouter/auto"] },
    "5": { "model": "google/gemini-2.5-flash" },
    "6": { "model": "deepseek/deepseek-v3.2" }
  }
}
```

**Estimated cost:** ~$0.06-0.10/article → ~$0.60-1.00 total

### Total Budget

| Run | Articles | Est/article | Total |
|-----|----------|-------------|-------|
| A | 10 | ~$0.25 | ~$2.50 |
| B | 10 | ~$0.12 | ~$1.20 |
| C | 10 | ~$0.25 | ~$2.50 |
| D | 10 | ~$0.08 | ~$0.80 |
| **Total** | **40 runs** | | **~$7.00** |

---

## Implementation

### Pipeline Override Mechanism

The `POST /api/process-article` route accepts an optional `pipelineConfig` in the request body:

```typescript
{
  articleId: string,
  pipelineConfig?: {
    name: string,
    phases: {
      1?: { model: string },
      3?: { model: string },
      4?: { models: string[] },
      5?: { model: string },
      6?: { model: string }
    }
  }
}
```

When provided, overrides the default `PIPELINE_CONFIG`. The config name is stored in `phase7_json.output._processing.config_name` for traceability.

### Execution Procedure

1. Create new Supabase user account for validation
2. Upload 10 selected PDFs
3. For each config (A, B, C, D):
   a. Reset all articles to `status: queued` (or use separate folder/project per config)
   b. Trigger processing with the config override
   c. Wait for all 10 to complete
   d. Export results via `/api/export-excel` and `/api/export-json`
4. Run analysis script

### Data Collection Per Run

For each article × config, the database already stores:
- `phaseN_json` — full LLM output with model, usage, timestamp
- `phaseN_cost`, `phaseN_tokens`, `phaseN_duration_ms`
- `phaseN_prompt_tokens`, `phaseN_completion_tokens`
- `confidence_scores` — inter-model agreement per field

Additionally log:
- OpenRouter Auto model selections (from response `model` field)
- Any phase failures or retries

---

## Manual Verification Protocol

### Fields to Verify (17 total)

**Metadata (7 fields):** title, authors, DOI, journal, year, PMID, study_type

**Scientific extraction (10 fields):** methodology, sample_size, population, intervention, control, primary_outcomes, secondary_outcomes, main_results, limitations, conclusions

### Scoring Scale

| Score | Meaning |
|-------|---------|
| 3 | Correct and complete |
| 2 | Correct but incomplete (missing some detail) |
| 1 | Partially correct (has errors but core info present) |
| 0 | Wrong, fabricated, or missing |

### Procedure

1. For each of the 10 articles, reviewer reads the original PDF
2. For each of the 17 fields, reviewer scores the Phase 7 consolidated output (0-3)
3. Reviewer scores each Phase 4 individual model output separately (for inter-model analysis)
4. All scoring is done blind to config identity where possible (reviewer sees output, not config name)

### Verification Spreadsheet

Template: `docs/verification-template.json`

```
Article 1 (title):
  Config A:
    Phase 7 (consolidated): { title: 3, authors: 3, doi: 3, ... }
    Phase 4 Model 1: { methodology: 2, sample_size: 3, ... }
    Phase 4 Model 2: { methodology: 3, sample_size: 3, ... }
    ...
  Config B:
    Phase 7 (consolidated): { title: 3, authors: 2, ... }
    Phase 4 Model 1: { methodology: 2, sample_size: 2, ... }
  ...
```

---

## Metrics and Analysis

### 1. Inter-Model Agreement (Phase 4)
- **Metric:** Pairwise Cohen's Kappa between models (for configs A, C, D with multiple models)
- **Method:** `extractFacts()` from each model's output → binary agreement on key facts → Kappa
- **Expected output:** Agreement matrix per field, mean agreement per config

### 2. Extraction Accuracy
- **Metric:** Mean score per field (0-3 scale from manual verification)
- **Comparison:** Config A vs B vs C vs D
- **Key test:** Is mean accuracy of Config A > Config B? (multi-model > single)
- **Key test:** Is mean accuracy of Config D ≥ Config B? (cheap ensemble ≥ expensive single)

### 3. Cost-Accuracy Tradeoff
- **Metric:** Accuracy per dollar spent
- **Visualization:** Scatter plot (x = cost/article, y = mean accuracy score)
- **Expected:** Diminishing returns curve; identify optimal cost-quality point

### 4. Enrichment Value (Phase 2+3)
- **Metric:** Correction rate = (fields where Phase 3 differs from Phase 1) / total fields
- **Fields to check:** DOI, year, PMID, citations, journal, open_access
- **Expected output:** Table showing how often each API contributed corrections

### 5. Confidence Calibration
- **Metric:** Pearson correlation between confidence scores and actual accuracy (from manual verification)
- **Visualization:** Calibration plot (x = confidence score, y = actual accuracy)
- **Expected:** Positive correlation; report r and p-value

### 6. Auto Router Analysis (Config C)
- **Data:** Which model did `openrouter/auto` select for each article in P3, P4, P6?
- **Analysis:** Were selections consistent? Did auto-selected models perform better/worse than fixed?

---

## Output for Paper

### Tables
1. **Table 1:** Pipeline configurations (A/B/C/D) with models per phase and cost
2. **Table 2:** Mean accuracy by field by config (17 fields × 4 configs)
3. **Table 3:** Inter-model agreement (Kappa) by field (configs A, C, D)
4. **Table 4:** Phase 2 enrichment contribution (which APIs provided which fields)
5. **Table 5:** Cost breakdown by phase by config

### Figures
1. **Figure 1:** Accuracy vs number of models (ablation curve: B=1, D=4cheap, A=4mixed, C=4nextgen)
2. **Figure 2:** Cost vs accuracy scatter (all 4 configs)
3. **Figure 3:** Confidence score calibration plot
4. **Figure 4:** API enrichment heatmap (articles × APIs × fields)
5. **Figure 5:** Processing time by phase by config (stacked bar)
