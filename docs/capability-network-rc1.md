# Capability Network RC1 — integration and release gates

Status: proposed integration contract; not a production release.

## Verified baseline (2026-11-13)
- Canonical public source: `Starlight-Intelligence/starlight-agent-skills`.
- Existing `SKILL.md`, `manifest.json`, `scripts/validate_skills.py`, catalog and Makefile checks. Reuse rather than replace.
- Open PR #31: Queen operator, dispatch and payments escalation.
- Open PR #46: browser QA evidence driver and signed receipt integration; its own PR documents key provenance and CI limitations.
- Open PR #39: Second Brain packaging and source-backed knowledge explorer.
- No evidence in this change of successful skills.sh indexing, production deployment, payment acceptance, or external user installation.

## Release gate A — portable distribution
1. Validate skill folders and frontmatter with existing `make check`.
2. Install pinned repository ref in clean Claude Code and Codex fixtures using official Skills CLI.
3. Verify `--list`, explicit skill selection, and documented invocation.
4. Record CLI version, git SHA, terminal output and resulting files.
5. Verify public skills.sh discovery independently; indexing is not assumed.

## Release gate B — agent collaboration
Define task contracts with `task_id`, `skill_ref` (immutable revision), `input_refs`, `output_schema`, `permission_scopes`, `max_cost`, `deadline`, `approval_policy`, `evaluator_ref`, and `receipt_ref`.
- Distinguish instructions from executable code and untrusted retrieval.
- Fail closed on missing permission, unbounded spend or absent approval.
- Idempotent dispatch and replay-safe receipt storage.
- Maker and Checker must be independent for release-critical outcomes.
- Reuse Queen kernel and signed evidence work from existing PRs after review.

## Release gate C — product experience
Discovery → skill detail → compatibility and trust → install → compose team → run → evidence → share.
Design acceptance: responsive 360/768/1440 widths; keyboard accessibility; accessible contrast; zero dead controls; explicit simulated vs live execution states; source-backed metrics only.
Existing brand design tokens and visual references take precedence over new styling.

## Release gate D — commercial readiness
Separate open skill licensing from paid execution, private-team features and support.
Do not activate payment capture until entitlement checks, receipts, refunds, support and legal terms are reviewed.
Do not treat install counts as verified task success.

## Work allocation
- Skill publisher: portable packaging, CLI smoke tests, skills.sh verification.
- Runtime owner: task contract, Queen integration, permissions and receipts.
- Product owner: existing Vercel app UI and browser evidence.
- Commerce owner: entitlement model and explicit production approval.
- Independent checker: cross-runtime install, security and evaluation.

## Immediate acceptance criteria
1. One pinned public skill installs from a clean environment.
2. One authorized two-agent handoff returns an inspectable artifact and evaluator result.
3. One mobile-to-desktop product journey shows provenance and clear execution state.
4. A draft PR links command output, CI checks, screenshots and any remaining blockers.

## Non-goals
No duplicate registry, invented canon, speculative success metrics, autonomous payment settlement, uncontrolled crawling or unapproved production deployment.
