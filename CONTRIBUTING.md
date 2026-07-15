# Contributing to Infinity Research

Thanks for your interest! This project is a research tool shared openly, and contributions — from typo fixes to new pipeline phases — are welcome.

## Ground rules

- **Be honest about reliability.** This tool assists human researchers; it does not replace them. Please don't add features or copy that overstate the accuracy of LLM extraction.
- **Never commit secrets.** No API keys, service-role keys, `.env` files or database dumps. `.env.example` documents every variable you need. If you think you committed a secret, tell a maintainer immediately so the key can be rotated.

## Development setup

1. Follow the Quickstart in the [README](README.md) to get a local instance running against your own Supabase project.
2. Use a **throwaway/dev Supabase project** for development, not one with real data.
3. Run the app with `npm run dev` and lint with `npm run lint` before opening a PR.

## Making changes

- Keep pull requests focused and describe *why*, not just *what*.
- If you change the database, update `supabase/schema/setup.sql` (the single canonical, idempotent schema) so a fresh install stays reproducible.
- If you change the pipeline, update `docs/ARCHITECTURE.md`.
- Match the existing code style; TypeScript and React across the app.

## Good first issues

- Move the processing queue server-side so runs survive a closed browser tab.
- Add application-layer encryption for stored BYOK keys.
- Add an automated test suite.
- Keep pipeline model IDs current as providers change.

## Reporting bugs / requesting features

Open an issue with clear steps to reproduce (for bugs) or a concrete use case (for features). Please don't paste API keys or private research data into issues.

## License

By contributing, you agree that your contributions will be licensed under the project's [AGPL-3.0](LICENSE) license.
