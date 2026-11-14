# Driver: a real browser check the Kernel can sign

Two scripts turn the skill's workflow into commands. The first drives a browser; the second
hands what it saw to the Starlight Kernel. Neither one decides the verdict or signs anything:
the Kernel does both.

| File | What it does |
|---|---|
| `browser-session.mjs` | Vets redirects one hop at a time, opens the page in Chromium at two viewports, runs the contract's checks, and writes a session folder |
| `issue-receipt.mjs` | Gives the session to a Kernel checkout, which writes the evidence, decides the verdict, signs a `starlight.receipt.v1`, and verifies it with the exported public key |
| `driver.test.mjs` | Eight cases against a real Chromium and a local fixture server |
| `contracts/` | The contract and policy used for the first live run |

## Run a check

```bash
node browser-session.mjs \
  --contract contracts/starlightintelligence-home.contract.json \
  --policy contracts/starlightintelligence.policy.json \
  --out /path/outside/the/repo/session

node issue-receipt.mjs \
  --kernel /path/to/starlight-kernel \
  --session /path/outside/the/repo/session \
  --contract contracts/starlightintelligence-home.contract.json \
  --policy contracts/starlightintelligence.policy.json \
  --evidence /path/outside/the/repo/evidence \
  --task-id browser-check-<site>-<date>
```

Needs Node 22 or later and Playwright with its Chromium. The scripts add no dependency to
this repository; Playwright is resolved from the machine.

## Which browser

The driver speaks the Chrome DevTools Protocol, so one driver covers three seats:

- **Default.** It launches its own headless Chromium.
- **A running browser.** Pass `--cdp http://127.0.0.1:<port>` to attach to a Chromium started
  with `--remote-debugging-port`. BrowserOS is a Chromium build, so this is the path for it;
  that attach has not been run against BrowserOS itself yet.
- **A remote browser.** Any endpoint that accepts a CDP connection takes the same flag. No
  hosted browser has been tried.

Whichever seat it is, the driver opens a fresh browser context per viewport: no cookies,
storage or profile from the browser it attached to.

## Contract and policy

The contract names each assertion as a sentence and gives each one a check. The Kernel hashes
the whole file into `contractId`, so a check cannot be loosened after the run without
changing the receipt.

| Check `kind` | Passes when |
|---|---|
| `status` | the page's response status equals `equals` (default 200) |
| `selector` | at least one visible element matches `selector`, at both viewports |
| `text` | the text is visible, at both viewports |
| `page-errors` | no uncaught script error fired |
| `console-errors` | no console error was logged |
| `doors` | every in-policy link matched by `selector` answers below 400; links the policy refuses are counted and never opened |

An assertion with no check fails. The policy is the Kernel's: `allowedHosts` and
`refusedPaths`. The driver applies it before each request leaves, and the Kernel applies it
again to the recorded timeline.

## The target

Pass `--target-sha <commit>` when you know the deployed commit, from the host's deployment
record for the domain. Without it the receipt binds a sha256 of the HTML the browser
received and says `targetKind: snapshot` in the manifest, which is the weaker form.

## What stays where

The session folder is working data: its timeline holds full URLs, because the Kernel must
judge the real URL before it redacts. Delete it after the receipt is issued and never share
it. The evidence folder is the shareable half: origin and path only, no cookies or
authorization headers.

## Tests

```bash
STARLIGHT_KERNEL=/path/to/starlight-kernel node --test driver.test.mjs
```

Without `STARLIGHT_KERNEL` the signed-receipt case is skipped and reported as skipped. The
tests are not part of `make check`, because CI for this repository has no browser.
