# Capability source intake and adoption matrix

Status: candidate sources, not endorsements or redistribution permissions. Owner: starlight-agent-skills; tracking #48 and frankxai/agentic-ops#554.

| Source | Type | Ingestion contract | Commercial reuse |
|---|---|---|---|
| modelcontextprotocol/registry | MCP registry | Official published API/export; source repository, published version, pagination receipts | Metadata discovery; per-server license review |
| skills.sh | Skill directory | Terms/API review before any automated sync | Link to original publisher; no blind mirroring |
| agentskills.io | Skill specification | Use format for interoperability, not as a skill feed | Specification rights reviewed separately |
| anthropics/skills | Skill repository | Git SHA + SKILL.md path + upstream license | Per-skill rights review |
| openai/skills | Skill repository | Git SHA + SKILL.md path + upstream license | Per-skill rights review |
| vercel-labs/skills | Installation tooling | Evaluate CLI and package conventions | License and dependency review |
| github/awesome-copilot | Curated catalog | Curated metadata with original upstream source | Verify individual entries |
| ComposioHQ/awesome-claude-skills | Curated catalog | Link-out discovery | Verify original owners |
| smithery.ai | MCP marketplace | API/terms assessment pending | Metadata only pending rights |
| glama.ai | MCP directory | API/terms assessment pending | Metadata only pending rights |
| mcp.so | MCP directory | API/terms assessment pending | Metadata only pending rights |
| anomalyco/opencode | Coding harness | Tagged releases, API compatibility, license | Integration rather than wholesale fork |
| All-Hands-AI/OpenHands | Coding harness | Tagged releases and sandbox contract | Integration and isolation |
| langchain-ai/langgraph | Orchestration runtime | Versioned API and eval adapter | Only for stateful graph workloads |
| cloudflare/agents | Durable runtime | Workers runtime integration tests | Use existing Cloudflare infrastructure |
| browser-use/browser-use | Browser harness | Sandboxed browser integration | Pair with Kura / policy boundaries |
| n8n-io/n8n | Workflow runtime | Workflow export schema and license review | Never assume workflow resale rights |
| activepieces/activepieces | Workflow runtime | Connector manifest and license review | Integrate under customer-owned credentials |
| promptfoo/promptfoo | Evaluation | CLI test artifacts | Use for adversarial regression tests |

## Admission states
Discovered → normalized → provenance resolved → rights reviewed → sandbox tested → compatible → approved for bundle → monitored. Rejected and quarantined are terminal/review states; popularity never bypasses a gate.

## Reproducible offline example
1. Save an official MCP Registry JSON response to a local file, `registry-response.json`.
2. `python3 scripts/import_mcp_registry.py registry-response.json --output mcp-candidates.json`
3. `python3 scripts/capability_registry.py mcp-candidates.json --output capabilities.json`
4. Inspect the output. Every record remains unverified; do not publish as a trusted catalog.

## Next source-adapter contract
A live fetcher must provide rate-limit handling, cursor checkpoints, retries with jitter, source observation timestamps, raw-response digest, immutable source ref, incremental reconciliation, and explicit quarantine for schema drift. Do not use arbitrary source URLs for fetch without host allowlisting and SSRF controls.

## Product direction
Free search and original-source attribution → verified installation packs → managed updates and compatibility → deployment services. Do not imply verified security or rights before test evidence exists.
