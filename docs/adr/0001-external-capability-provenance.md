# ADR 0001: Metadata-first external capability ingestion

Status: Proposed (draft PR). Owner: starlight-agent-skills. Tracking: #48; frankxai/agentic-ops#554.

## Context
This repository already owns 42 curated local skills and a generated catalog. External discovery must not pollute the canonical skill catalog, bypass release checks, or create a second source of truth.

## Decision
Start with a separate, standard-library-only JSON metadata normalizer. Require an HTTPS source URL, explicit capability type, publisher/source label, and revision identifier. Canonical URL plus type yields a stable identity; identical duplicates merge source labels. Conflicting revision or license evidence fails closed. No executable code is fetched, installed, or evaluated.

An absent license remains unknown. All ingested entries are **unverified**, regardless of the license claim. The registry is a discovery index, not a trust certification. No source URLs are fetched by this first increment.

## Future adapters
Implement upstream API adapters only after source-specific terms, pagination, backoff, rate limits, content licensing, checkpoint persistence, and source receipts are reviewed. Revision values should be immutable commit SHA or digest, not mutable branch names. Preserve separate source observation records when multiple revisions coexist.

## Integration boundary
Existing `scripts/generate_catalog.py` and `docs/CATALOG.md` remain authoritative for owned skills. External records must not enter that catalog until explicitly curated. Starlight Intelligence System owns runtime; the skills repository owns metadata and skill packaging. Reuse the existing weekly skills intelligence automation.

## Security and economics
No runtime execution, network fetch, credential handling, database, new dependency or cloud spend in this PR. Unknown rights block redistribution. Never present unverified metadata as endorsed or safe.

## Acceptance and rollback
Run `python3 -m unittest discover -s tests -p 'test_capability_registry.py'`; then existing `make check`. Remove the new script, tests and ADR to roll back. Follow-up PRs add ingestion adapters, provenance receipts, version history, compatibility and sandbox verification.
