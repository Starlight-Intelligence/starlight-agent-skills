---
name: visual-identity-preflight
description: "Resolve an owned logo or character against VIS before image generation, editing, slide and newsletter export, or publication. Use for every placement that depends on canonical identity."
metadata: {"version":"0.1.0","domain":"brand","tags":"identity,logo,character,folio,rights"}
---

# Visual identity preflight

Run one preflight for each owned identity and target placement. The [VIS resolver](https://github.com/frankxai/visual-intelligence/pull/85) owns resolution. The portfolio estate and product owners supply the underlying decisions. This skill stores no copies of the originals.

## Inputs

Supply the identity ID, variant, intended use, channel and required approval. Preserve expected version and SHA-256 from the previous step across generation and export. A change in scope requires fresh resolution.

## Workflow

1. On a trusted local runtime, call the stdio MCP tool `visual.identity.resolve` with `required_approval=identity`. Shell-capable clients may pipe the same JSON into `node skills/brand/visual-identity-preflight/preflight.mjs`. The operator configures an absolute `VIS_RUNTIME_ROOT` and the authority mounts. A brief, prompt or tool argument cannot select them.
2. Require a resolved receipt naming the exact identity, variant, version, use, channel and immutable master. Composite original logo bytes. For a character, load every required folio, retain the named character ID even on a shared sheet, and route the resulting scene to a human identity reviewer.
3. For an existing approved derivative, the authenticated hosted gateway accepts an additional tenant-scoped brand and `required_approval=asset-use`. Its pending-byte-verification response requires the consumer to read and hash **both** original and derivative from the named versions. Creator Command implements this before spend and staging. The local identity receipt permits only its recorded use.
4. At export and publication recheck the bound bytes and current decision. Require the responsible human's separate approval for this exact release. On an unavailable tool, missing source, revoked or mismatching decision, mark the visual placement unresolved and stop the visual operation. Keep text-only editorial work available.

## Runtimes

ChatGPT Work should use its installed tool and scoped bindings. Claude Code, Codex, Gemini, Antigravity and OpenCode can use the configured MCP capability or a local shell bridge when exposed. In restricted sessions, surface the unresolved result. Never infer a tool connection from a client name. A link, prompt or file search is insufficient evidence of identity.

## Output contract

Return the receipt unchanged to the calling pipeline. Preserve its status and publication flag. Log its immutable pointer, approval scope and reviewer with the candidate. Keep private source files within the authorized workspace.

Built on SIP — Starlight Intelligence Protocol
