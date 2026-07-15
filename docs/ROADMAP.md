# Infinity Research — Roadmap

## Current State (v5.0)

Infinity covers **one stage** of the systematic review workflow: **automated data extraction from PDFs**. It does this with a unique multi-model consensus architecture that no competitor currently ships.

What exists today:
- 7-phase extraction pipeline (metadata → enrichment → consensus → multi-model extraction → visual → consolidation → merge)
- 11-API bibliographic enrichment with field-level provenance
- Programmatic confidence scoring (inter-model agreement)
- BYOK model (user's own OpenRouter key)
- Excel + JSON export
- Per-phase cost/token/duration tracking
- Web dashboard with Realtime updates

What does NOT exist:
- Search or screening
- PRISMA reporting
- Collaboration / dual reviewer
- Critical appraisal (risk of bias)
- Statistical meta-analysis
- Manuscript assistance
- Automated tests or validation against ground truth

---

## Vision: Full Meta-Analysis Platform

The goal is to cover the complete workflow:

```
PICOT Question → Search Strategy → Database Import → Deduplication
→ Screening → Extraction → Critical Appraisal → Statistical Analysis
→ PRISMA + Manuscript
```

### Wave 1: Validate + Close Critical Gaps (1-2 months)

**Priority: Prove the extraction pipeline works before expanding.**

| Feature | Effort | Notes |
|---------|--------|-------|
| Ground-truth validation study | 2-3 weeks | 10 articles × 4 configs, manual verification, inter-model agreement metrics |
| PICOT + inclusion/exclusion criteria | 1 week | LLM-assisted structured form (Phase 0) |
| RIS/CSV/BibTeX import | 1 week | Manual import from Embase, Cochrane, etc. |
| Deduplication | 2-3 days | DOI exact match + fuzzy title matching |
| PRISMA flow diagram | 2-3 days | Auto-count articles at each stage, render as SVG/Mermaid |
| Standard exports | 1 week | RIS, CSV with PRISMA columns, RevMan XML |

**Publication target:** Validation paper with accuracy metrics, ablation study (1 vs 2 vs 3 vs 4 models), cost analysis.

### Wave 2: Screening + Critical Appraisal (months 3-5)

**Priority: Move from "extraction tool" to "review tool."**

| Feature | Effort | Notes |
|---------|--------|-------|
| Title/abstract screening | 3-4 weeks | LLM-assisted relevance ranking, active learning |
| Full-text screening | 2 weeks | Second-pass screening with PDF access |
| Dual reviewer + conflict resolution | 2-3 weeks | Multi-user support, adjudication workflow |
| Critical appraisal (RoB 2) | 2 weeks | Pre-fill risk of bias domains from Phase 4/6 data |
| ROBINS-I, Newcastle-Ottawa | 1-2 weeks | Additional appraisal tools for observational studies |

**Publication target:** End-to-end screening + extraction benchmark vs Covidence/Rayyan.

### Wave 3: Statistics + Synthesis (months 6-9)

**Priority: Close the loop from question to publication.**

| Feature | Effort | Notes |
|---------|--------|-------|
| Search strategy generation | 2-3 weeks | LLM generates Boolean + MeSH queries per database |
| Database search integration | 2-3 weeks | PubMed E-utilities, OpenAlex search. Embase = manual import |
| Statistical meta-analysis | 4-6 weeks | R integration (metafor) or WebR. Forest/funnel plots, I², heterogeneity |
| Subgroup/sensitivity analysis | 2 weeks | Built on top of meta-analysis engine |
| Manuscript assistance | 2-3 weeks | Methods section draft, PRISMA checklist, results summary |

**Publication target:** Full pipeline paper (PICOT-to-publication).

---

## Strategic Decisions

### Open-Core Model
- **Open:** Pipeline engine (`src/lib/processing/`), schemas, confidence algorithm, enrichment logic. Published as npm package or CLI.
- **Closed:** Web application, dashboard, queue management, collaboration features, export formats.

### Why Open-Core
1. Academic trust requires inspectable methods
2. Pipeline logic is not defensible IP (replicable in days)
3. Moat is in UX, validation data, and accumulated schemas
4. Enables community contributions (new schemas, study types, APIs)

### Competitive Positioning
- **Not** another Covidence/Rayyan (screening-first)
- **Not** another Elicit (general research assistant)
- **Positioning:** The only platform with validated multi-model consensus extraction, field-level provenance, and transparent cost tracking
- **Differentiator:** Architecture > individual model quality (proven by ablation study)

---

## Technical Debt to Address

| Item | Priority | Notes |
|------|----------|-------|
| Unify pipeline paths | High | Kill `phase-runner` or `process-article` monolith. One canonical path. |
| Server-side job queue | High | Replace client-side `useProcessingQueue` with Inngest/pg-boss |
| Zod validation on LLM outputs | High | Runtime validation after JSON schema enforcement |
| Structured logging | Medium | Pino + correlation IDs per pipeline run |
| Error monitoring | Medium | Sentry or similar |
| Middleware auth | Medium | Wire `proxy.ts` as proper `middleware.ts` |
| Centralize types | Low | Remove inline Article/Folder interfaces from components |
| Remove legacy directory | Low | `legacy/` is dead code |
| Clean duplicate configs | Low | Remove `next.config.mjs` (keep `.ts`) |
