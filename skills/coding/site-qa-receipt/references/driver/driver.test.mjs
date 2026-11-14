// Runs the driver against a real Chromium and a local fixture server. Needs Playwright and
// its Chromium on the machine: `node --test skills/coding/site-qa-receipt/references/driver/`.
// Set STARLIGHT_KERNEL to a starlight-kernel checkout to also run the signed-receipt case.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { refused, runSession } from './browser-session.mjs';
import { issueBrowserReceipt } from './issue-receipt.mjs';

const PAGES = {
  '/': '<title>Home</title><h1>Join the waitlist</h1><form action="/join"><input name="email"><button>Join</button></form><a href="/about">About</a><a href="/checkout?plan=pro">Buy</a>',
  '/about': '<title>About</title><h1>About</h1>',
  '/broken': '<title>Broken</title><h1>Broken</h1><a href="/missing">Gone</a><script>throw new Error("boom")</script>',
  '/typed': '<title>Typed</title><h1>Typed</h1><script>console.error("failed https://example.test/search?q=private+words")</script>',
  '/checkout': '<title>Checkout</title><h1>Pay</h1>',
};

async function fixtureSite(t) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    hits.push(pathname);
    if (pathname === '/go') { res.writeHead(302, { location: '/checkout?plan=pro' }); return res.end(); }
    if (pathname === '/hop') { res.writeHead(302, { location: '/about' }); return res.end(); }
    if (!PAGES[pathname]) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>404</h1>'); }
    res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'sid=secret' });
    res.end(`<!doctype html><html><body>${PAGES[pathname]}</body></html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const dir = mkdtempSync(path.join(tmpdir(), 'site-qa-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { origin: `http://127.0.0.1:${server.address().port}`, hits, dir };
}

const policy = { allowedHosts: ['127.0.0.1'], refusedPaths: ['checkout', 'billing', 'payment', 'stripe', 'paypal', '/pay'] };

const contractFor = (url, names) => ({
  url,
  viewports: ['1440x900', '390x844'],
  assertions: names,
  checks: [
    { name: 'page returns 200', kind: 'status', equals: 200 },
    { name: 'waitlist form present', kind: 'selector', selector: 'form input[name="email"]' },
    { name: 'heading says waitlist', kind: 'text', text: 'Join the waitlist' },
    { name: 'no uncaught page errors', kind: 'page-errors' },
    { name: 'no console errors', kind: 'console-errors' },
    { name: 'no dead doors', kind: 'doors', selector: 'a[href]' },
  ],
});

const byName = (session) => Object.fromEntries(session.assertions.map((a) => [a.name, a]));

test('the guard refuses other hosts, refused paths, encoded paths and non-web schemes', () => {
  assert.equal(refused('http://127.0.0.1/', policy), false);
  assert.equal(refused('http://evil.example/', policy), true);
  assert.equal(refused('http://127.0.0.1/checkout', policy), true);
  assert.equal(refused('http://127.0.0.1/%2563heckout', policy), true);
  assert.equal(refused('http://127.0.0.1/api?next=/PAY', policy), true);
  assert.equal(refused('file:///etc/passwd', policy), true);
});

test('a healthy page passes every contracted check at both viewports and keeps real screenshots', async (t) => {
  const site = await fixtureSite(t);
  const names = ['page returns 200', 'waitlist form present', 'heading says waitlist', 'no uncaught page errors', 'no console errors', 'no dead doors'];
  const session = await runSession({ contract: contractFor(`${site.origin}/`, names), policy, outDir: path.join(site.dir, 'session') });
  const results = byName(session);
  for (const name of [...names, 'browser reports the requested url']) assert.equal(results[name]?.pass, true, name);
  assert.deepEqual(results['no dead doors'].actual, { found: 2, opened: 1, notOpened: 1, dead: [] });
  assert.equal(site.hits.includes('/checkout'), false, 'the checkout door was found and never opened');
  assert.equal(session.target.kind, 'snapshot');
  assert.match(session.target.sha, /^[0-9a-f]{64}$/);
  for (const name of ['desktop', 'mobile']) {
    const png = readFileSync(path.join(site.dir, 'session', `screenshot-${name}.png`));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
  }
  assert.doesNotMatch(readFileSync(path.join(site.dir, 'session', 'session.json'), 'utf8'), /sid=secret|set-cookie/i);
});

test('a redirect toward a refused path stops before the browser opens it', async (t) => {
  const site = await fixtureSite(t);
  const session = await runSession({ contract: contractFor(`${site.origin}/go`, ['page returns 200']), policy, outDir: path.join(site.dir, 'session') });
  assert.deepEqual(site.hits, ['/go']);
  assert.equal(session.timeline.at(-1).action, 'refused');
  assert.equal(session.assertions.every((a) => a.pass === false), true);
  assert.equal(session.target.sha, null);
});

test('an allowed redirect is followed one vetted hop at a time', async (t) => {
  const site = await fixtureSite(t);
  const session = await runSession({ contract: contractFor(`${site.origin}/hop`, ['page returns 200']), policy, outDir: path.join(site.dir, 'session') });
  assert.equal(session.timeline[0].action, 'redirect');
  assert.equal(byName(session)['page returns 200'].pass, true);
  assert.equal(byName(session)['browser reports the requested url'].actual, `${site.origin}/about`);
});

test('a host outside the policy is never requested', async (t) => {
  const site = await fixtureSite(t);
  const closed = { allowedHosts: ['example.test'], refusedPaths: [] };
  const session = await runSession({ contract: contractFor(`${site.origin}/`, ['page returns 200']), policy: closed, outDir: path.join(site.dir, 'session') });
  assert.deepEqual(site.hits, []);
  assert.equal(session.assertions[0].pass, false);
});

test('a dead door, an uncaught error and an unchecked assertion each fail', async (t) => {
  const site = await fixtureSite(t);
  const names = ['no dead doors', 'no uncaught page errors', 'has a pricing table'];
  const session = await runSession({ contract: contractFor(`${site.origin}/broken`, names), policy, outDir: path.join(site.dir, 'session') });
  const results = byName(session);
  assert.deepEqual(results['no dead doors'].actual.dead, [{ door: `${site.origin}/missing`, status: 404 }]);
  assert.equal(results['no uncaught page errors'].pass, false);
  assert.equal(results['has a pricing table'].actual, 'no check defined');
});

test('query strings in console text never reach the session', async (t) => {
  const site = await fixtureSite(t);
  await runSession({ contract: contractFor(`${site.origin}/typed`, ['page returns 200']), policy, outDir: path.join(site.dir, 'session') });
  const saved = readFileSync(path.join(site.dir, 'session', 'session.json'), 'utf8');
  assert.match(saved, /https:\/\/example\.test\/search/);
  assert.doesNotMatch(saved, /private/);
});

test('the Kernel signs a real session, verifies it with the exported key, and fails a tampered copy', { skip: !process.env.STARLIGHT_KERNEL && 'set STARLIGHT_KERNEL to a starlight-kernel checkout' }, async (t) => {
  const site = await fixtureSite(t);
  const names = ['page returns 200', 'waitlist form present', 'no dead doors'];
  const contract = contractFor(`${site.origin}/`, names);
  const sessionDir = path.join(site.dir, 'session');
  await runSession({ contract, policy, outDir: sessionDir });
  const evidenceDir = path.join(site.dir, 'evidence');
  const kernel = path.resolve(process.env.STARLIGHT_KERNEL);
  const result = await issueBrowserReceipt({ kernel, sessionDir, contract, policy, evidenceDir, home: path.join(site.dir, 'home'), taskId: 'driver-test' });
  assert.equal(result.verdict, 'accept');
  assert.deepEqual(result.verified_with_exported_key, { valid: true, reasons: [] });
  assert.doesNotMatch(readFileSync(path.join(evidenceDir, 'network.json'), 'utf8'), /\?plan=|sid=secret/);

  const { verifyReceiptWithKey, exportPublicKey } = await import(path.join(kernel, 'src', 'receipt.mjs'));
  const receipt = JSON.parse(readFileSync(result.receipt_file, 'utf8'));
  const { publicKey } = exportPublicKey(path.join(site.dir, 'home'));
  writeFileSync(path.join(evidenceDir, 'assertions.json'), '[]\n');
  const tampered = verifyReceiptWithKey(publicKey, receipt, {}, { evidenceDir });
  assert.equal(tampered.valid, false);
  assert.match(tampered.reasons.join('; '), /evidence hash mismatch: assertions\.json/);
});
