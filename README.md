# Infinity Research

**Automated, reproducible structured extraction from scientific PDFs.**

Infinity Research turns a folder of research-paper PDFs into a validated, structured dataset you can export to Excel or JSON. It is built for systematic reviews, meta-analyses and evidence synthesis, where **reliability and traceability matter more than raw speed**.

It is **BYOK (Bring Your Own Key)**: you run it with your own [OpenRouter](https://openrouter.ai) API key, so you pay LLM providers directly and your data never passes through a third-party service.

> [!WARNING]
> Infinity Research is a research aid, not a source of truth. LLM extraction can be wrong. Every extracted record should be checked by a human before use in a publication. The built-in review system exists for exactly this reason.

---

## Why it's different

Most "chat with your PDF" tools do single-model extraction and give you no way to know how much to trust the output. Infinity Research is designed around two ideas:

- **Multi-model consensus.** Key scientific data is extracted by several models in parallel, then a programmatic confidence score measures how much the models *agree on the actual numbers* (percentages, p-values, confidence intervals, sample sizes, AUC/accuracy...). Disagreement is surfaced instead of hidden.
- **Provenance.** Bibliographic metadata is cross-checked against 11 public APIs (PubMed, Crossref, OpenAlex, Semantic Scholar, Europe PMC, arXiv, DataCite, Unpaywall, DOAJ, ORCID, CORE). The final record records *where each field came from* and which conflicting sources were rejected and why.

The result is a "golden record" per article with a documented, auditable trail — the kind of reproducibility a systematic review needs.

---

## The 7-phase pipeline

| Phase | What it does | Model(s) |
|------:|--------------|----------|
| 1 | Metadata extraction (title, authors, DOI, study type, ...) | single vision/LLM |
| 2 | 11-API bibliographic enrichment | none (HTTP) |
| 3 | Consensus + provenance (golden record) | single LLM |
| 4 | Multi-model scientific extraction | 4 models in parallel |
| – | Programmatic confidence scoring (fact agreement) | none (code) |
| 5 | Visual extraction from tables/figures (conditional) | vision LLM |
| 6 | Scientific consolidation | single LLM |
| 7 | Deterministic final merge | none (code) |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

---

## Tech stack

Next.js 16 (App Router) · React 19 · Supabase (Postgres, Auth, Storage, Realtime) · Tailwind CSS 4 · OpenRouter · Vercel.

---

## Quickstart (self-hosted)

You will host your own instance. Everything below uses free tiers except the LLM calls, which you pay for via OpenRouter.

### 1. Prerequisites
- Node.js 20.6+ and npm
- A free [Supabase](https://supabase.com) project
- An [OpenRouter API key](https://openrouter.ai/keys)

### 2. Clone & install
```bash
git clone <YOUR_REPO_URL> infinity-research
cd infinity-research
npm install
```

### 3. Set up the database
In the Supabase dashboard, open the **SQL Editor** and run the contents of:
```
supabase/schema/setup.sql
```
This creates every table, RLS policy, trigger, function, the private `article-pdfs` storage bucket and the realtime publications. It is idempotent (safe to re-run).

### 4. Configure environment
```bash
cp .env.example .env.local
```
Fill in the Supabase values (Project Settings → API):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only — never expose to the browser)

### 5. Run
```bash
npm run dev
```
Open http://localhost:3000, create an account, then go to **Settings** and paste your **OpenRouter API key**. Now upload PDFs and process them.

### 6. Deploy (optional)
Deploy to [Vercel](https://vercel.com), setting the same environment variables in the project settings. Point it at your Supabase project and you're live.

---

## Cost

You pay OpenRouter per token. Cost per article depends on the models you select and the length of the PDF; the app tracks **actual cost per phase and per article** and shows it in the dashboard and Excel export, so you always know what you spent.

---

## Known limitations

This project started as a single-author research tool and is shared in that spirit. Notably:

- The processing queue is client-side — if you close the browser tab mid-run, processing stops.
- BYOK API keys are stored in your own Supabase database, protected by row-level security, but **not encrypted at rest** at the application layer. Because you self-host, this is your own database; still, treat your `SUPABASE_SERVICE_ROLE_KEY` as a master secret.
- No automated test suite yet.
- Model IDs in the pipeline config may need updating as providers change availability.

Contributions that address these are very welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Citing

If Infinity Research helps your research, please cite it — see [`CITATION.cff`](CITATION.cff).

## License

[GNU AGPL-3.0](LICENSE). In short: you're free to use, modify and self-host it, but if you offer it to others over a network, you must make your modified source available under the same license.
