# ADR 0002: Release validator tag-topology failure

Status: Investigating. Tracking: #48, PR #49.

On commit 9dbb0c4, registry checks passed (run 44203992186), but the repository's existing `validate` workflow failed at `scripts/validate_release.py` (run 44203992235, job 134465111088).

The validator requires the fetched Git tag set to be either empty or exactly four historical local receipt tags from `docs/releases/release-ledger.json`. The checkout uses `fetch-depth: 0`, so the CI tag topology can differ from the historical local-only topology. This failure occurs after frontmatter, examples, catalog, rules and plugin checks pass.

Do **not** weaken the release ledger's historic receipt requirements, change release status, delete tags, or skip the release gate as part of the capability registry feature. Diagnose current tag names against the ledger and main-branch CI first, then implement a separately reviewed release-governance repair if warranted.

Registry tests and release-governance validation are independent gates. Passing registry tests does not establish PR merge readiness.
