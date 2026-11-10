#!/usr/bin/env node
// Drives one contracted page check in a real Chromium and writes a session folder in the shape
// the Starlight Kernel browser evidence adapter reads. It never signs and never decides the
// verdict: issue-receipt.mjs hands the session to the Kernel for both.
//
// The browser is reached over the Chrome DevTools Protocol, so the same driver runs a local
// Chromium (default), a BrowserOS instance, or a remote browser: pass --cdp <endpoint>.

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_REDIRECT_HOPS = 5;
const MAX_DECODE_PASSES = 3;
const DEFAULT_VIEWPORTS = ['1440x900', '390x844'];
const DEFAULT_DOOR_LIMIT = 25;
const NAVIGATION_TIMEOUT_MS = 45_000;
const SETTLE_TIMEOUT_MS = 5_000;
const URL_ASSERTION = 'browser reports the requested url';

// The Kernel judges the recorded timeline with the same rule after the run. This copy exists so
// the driver can refuse *before* a request leaves; it must never be looser than the Kernel's.
function decodedOrNull(text) {
  let current = text;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    let next;
    try { next = decodeURIComponent(current); } catch { return null; }
    if (next === current) return current;
    current = next;
  }
  return /%[0-9a-f]{2}/i.test(current) ? null : current;
}

export function refused(rawUrl, policy) {
  let url;
  try { url = new URL(rawUrl); } catch { return true; }
  if (!['http:', 'https:'].includes(url.protocol)) return true;
  if (!policy.allowedHosts.includes(url.hostname)) return true;
  const where = decodedOrNull(`${url.pathname}${url.search}`);
  if (where === null) return true;
  const lower = where.toLowerCase();
  return policy.refusedPaths.some((part) => lower.includes(part.toLowerCase()));
}

// Evidence keeps origin and path only: a query string can carry what a person typed.
const bare = (rawUrl) => {
  try { const url = new URL(rawUrl); return `${url.origin}${url.pathname}`; } catch { return '[invalid url]'; }
};
const bareText = (text) => String(text).replace(/https?:\/\/[^\s"')]+/g, bare).slice(0, 500);

function parseViewport(spec) {
  const match = /^(\d+)x(\d+)$/.exec(spec);
  if (!match) throw new Error(`viewport must look like 1440x900, got ${spec}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

// One hop at a time, never following a redirect the policy has not seen. Returns the vetted
// final URL, or null when a hop was refused; every hop lands in the timeline either way.
async function vetRedirects(request, startUrl, policy, timeline) {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    if (refused(current, policy)) {
      timeline.push({ action: 'refused', url: current, reason: 'policy' });
      return null;
    }
    const response = await request.fetch(current, { maxRedirects: 0, timeout: NAVIGATION_TIMEOUT_MS });
    const location = response.headers().location;
    if (response.status() < 300 || response.status() >= 400 || !location) return current;
    timeline.push({ action: 'redirect', from: bare(current), status: response.status() });
    current = new URL(location, current).href;
  }
  timeline.push({ action: 'refused', url: current, reason: 'too many redirects' });
  return null;
}

async function checkDoors(page, request, check, policy, network) {
  const hrefs = await page.locator(check.selector || 'a[href]').evaluateAll((nodes) => nodes.map((node) => node.href));
  const doors = [...new Set(hrefs.filter((href) => /^https?:/.test(href)).map((href) => href.split('#')[0]))]
    .slice(0, check.max || DEFAULT_DOOR_LIMIT);
  const dead = [];
  let opened = 0;
  let notOpened = 0;
  for (const door of doors) {
    if (refused(door, policy)) { notOpened += 1; continue; }
    opened += 1;
    let status = 0;
    try { status = (await request.fetch(door, { maxRedirects: 0, timeout: NAVIGATION_TIMEOUT_MS })).status(); } catch { /* status 0 is a dead door */ }
    network.push({ method: 'GET', url: bare(door), status, via: 'door-check' });
    if (status === 0 || status >= 400) dead.push({ door: bare(door), status });
  }
  return { expected: { dead: 0 }, actual: { found: doors.length, opened, notOpened, dead }, pass: opened > 0 && dead.length === 0 };
}

async function evaluateCheck(check, view) {
  const { page, response, pageErrors, consoleErrors } = view;
  switch (check.kind) {
    case 'status': {
      const actual = response ? response.status() : 0;
      return { expected: check.equals ?? 200, actual, pass: actual === (check.equals ?? 200) };
    }
    case 'selector': {
      const actual = await page.locator(check.selector).filter({ visible: true }).count();
      return { expected: '>=1 visible', actual, pass: actual >= 1 };
    }
    case 'text': {
      const actual = await page.getByText(check.text, { exact: false }).filter({ visible: true }).count();
      return { expected: '>=1 visible', actual, pass: actual >= 1 };
    }
    case 'page-errors':
      return { expected: 0, actual: pageErrors.length, pass: pageErrors.length === 0 };
    case 'console-errors':
      return { expected: 0, actual: consoleErrors.length, pass: consoleErrors.length === 0 };
    default:
      return { expected: 'a known check kind', actual: `unknown kind ${check.kind}`, pass: false };
  }
}

// Playwright ignores the proxy environment, and with a proxy set it also proxies loopback
// unless told otherwise, so both the server and the bypass list are passed through.
function proxyFromEnv() {
  const server = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!server) return {};
  const bypass = process.env.NO_PROXY || process.env.no_proxy;
  return { proxy: { server, ...(bypass && { bypass }) } };
}

async function openBrowser(playwright, cdp) {
  if (cdp) return playwright.chromium.connectOverCDP(cdp);
  return playwright.chromium.launch(proxyFromEnv());
}

export async function runSession({ contract, policy, outDir, cdp, targetSha }) {
  if (existsSync(outDir) && readdirSync(outDir).length) throw new Error('session folder must be new or empty');
  const viewports = contract.viewports?.length ? contract.viewports : DEFAULT_VIEWPORTS;
  if (viewports.length !== 2) throw new Error('the Kernel adapter takes exactly two viewports: desktop then mobile');
  const checks = new Map((contract.checks || []).map((check) => [check.name, check]));

  const require = createRequire(import.meta.url);
  const playwright = require('playwright');
  const request = await playwright.request.newContext(proxyFromEnv());

  const timeline = [];
  const consoleLog = [];
  const network = [];
  const results = new Map();
  const screenshots = {};
  let snapshot = null;
  let browser = null;

  // A contracted assertion fails unless it passes at every viewport that evaluated it.
  const record = (name, result, viewport) => {
    const prior = results.get(name);
    if (!prior || (prior.pass && !result.pass)) results.set(name, { name, ...result, ...(viewport && { viewport }) });
  };

  try {
    const finalUrl = await vetRedirects(request, contract.url, policy, timeline);
    if (finalUrl) {
      browser = await openBrowser(playwright, cdp);
      for (const [index, spec] of viewports.entries()) {
        // A fresh context per viewport: no cookies, storage or profile carried in from anywhere.
        const context = await browser.newContext({ viewport: parseViewport(spec) });
        const page = await context.newPage();
        const pageErrors = [];
        const consoleErrors = [];
        await context.route('**/*', (route) => {
          const req = route.request();
          if (req.isNavigationRequest() && req.frame() === page.mainFrame() && refused(req.url(), policy)) {
            timeline.push({ action: 'refused', url: req.url(), reason: 'policy', viewport: spec });
            return route.abort('blockedbyclient');
          }
          return route.continue();
        });
        page.on('console', (message) => {
          if (!['error', 'warning'].includes(message.type())) return;
          consoleLog.push({ type: message.type(), text: bareText(message.text()), viewport: spec });
          if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('pageerror', (error) => {
          pageErrors.push(error.message);
          consoleLog.push({ type: 'pageerror', text: bareText(error.message), viewport: spec });
        });
        page.on('response', (res) => network.push({ method: res.request().method(), url: bare(res.url()), status: res.status(), resourceType: res.request().resourceType(), viewport: spec }));
        page.on('requestfailed', (req) => network.push({ method: req.method(), url: bare(req.url()), status: 0, failure: req.failure()?.errorText, viewport: spec }));
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame() && frame.url() !== 'about:blank') timeline.push({ action: 'navigate', url: frame.url(), viewport: spec });
        });

        let response = null;
        try {
          response = await page.goto(finalUrl, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
          await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS }).catch(() => {});
        } catch (error) {
          consoleLog.push({ type: 'navigation-error', text: bareText(error.message.split('\n')[0]), viewport: spec });
        }
        timeline.push({ action: 'goto', url: finalUrl, viewport: spec, status: response ? response.status() : 0 });

        record(URL_ASSERTION, { expected: bare(finalUrl), actual: bare(page.url()), pass: bare(page.url()) === bare(finalUrl) }, spec);
        const view = { page, response, pageErrors, consoleErrors };
        for (const name of contract.assertions) {
          const check = checks.get(name);
          if (!check) { record(name, { expected: 'a check in the contract', actual: 'no check defined', pass: false }); continue; }
          if (check.kind === 'doors') {
            if (index === 0) record(name, await checkDoors(page, request, check, policy, network));
            continue;
          }
          record(name, await evaluateCheck(check, view), spec);
        }

        screenshots[index === 0 ? 'desktop' : 'mobile'] = await page.screenshot({ fullPage: false });
        timeline.push({ action: 'screenshot', viewport: spec });
        if (index === 0 && response) snapshot = createHash('sha256').update(await response.body()).digest('hex');
        await context.close();
      }
    }

    const version = browser ? browser.version() : null;
    const target = targetSha ? { kind: 'commit', sha: targetSha } : { kind: 'snapshot', sha: snapshot };
    const assertions = finalUrl
      ? [...results.values()]
      : contract.assertions.map((name) => ({ name, expected: 'a vetted page', actual: 'not opened: refused by policy', pass: false }));
    const session = {
      url: contract.url,
      target,
      driver: { name: 'playwright', version: require('playwright/package.json').version, browser: 'chromium', browserVersion: version, cdp: Boolean(cdp) },
      timeline,
      console: consoleLog,
      network,
      assertions,
    };
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, 'session.json'), `${JSON.stringify(session, null, 2)}\n`);
    for (const [name, bytes] of Object.entries(screenshots)) writeFileSync(path.join(outDir, `screenshot-${name}.png`), bytes);
    return session;
  } finally {
    await request.dispose();
    if (browser) await browser.close();
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`bad argument near ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  for (const required of ['contract', 'policy', 'out']) {
    if (!args[required]) {
      console.error('usage: browser-session.mjs --contract <file> --policy <file> --out <new dir> [--cdp <endpoint>] [--target-sha <deployed commit>]');
      process.exit(2);
    }
  }
  const session = await runSession({
    contract: JSON.parse(readFileSync(args.contract, 'utf8')),
    policy: JSON.parse(readFileSync(args.policy, 'utf8')),
    outDir: path.resolve(args.out),
    cdp: args.cdp,
    targetSha: args['target-sha'],
  });
  console.log(JSON.stringify({ session: path.resolve(args.out), target: session.target, driver: session.driver, assertions: session.assertions }, null, 2));
}
