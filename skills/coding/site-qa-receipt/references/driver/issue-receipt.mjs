#!/usr/bin/env node
// Hands a session folder from browser-session.mjs to a Starlight Kernel checkout: the Kernel
// writes the evidence, decides the verdict, signs the receipt, and verifies it again with the
// exported public key alone. Nothing here judges or signs.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`bad argument near ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

export async function issueBrowserReceipt({ kernel, sessionDir, contract, policy, evidenceDir, home, taskId }) {
  const load = (file) => import(pathToFileURL(path.join(kernel, 'src', file)).href);
  const adapter = await load('adapters/browser-evidence.mjs');
  const { collectEvidence } = await load('evidence.mjs');
  const { issueReceipt, exportPublicKey, verifyReceiptWithKey } = await load('receipt.mjs');
  const { kernelHome } = await load('home.mjs');
  const kernelVersion = JSON.parse(readFileSync(path.join(kernel, 'package.json'), 'utf8')).version;

  const session = JSON.parse(readFileSync(path.join(sessionDir, 'session.json'), 'utf8'));
  if (!session.target?.sha) throw new Error('session has no target: the page was never opened, so there is nothing to bind a receipt to');
  session.screenshots = {
    desktop: readFileSync(path.join(sessionDir, 'screenshot-desktop.png')),
    mobile: readFileSync(path.join(sessionDir, 'screenshot-mobile.png')),
  };

  const entries = adapter.writeBrowserEvidence(evidenceDir, session, session.target);
  const files = collectEvidence(entries, evidenceDir);
  const verdict = adapter.sessionVerdict(session, policy, contract);
  const { driver } = session;
  const fields = adapter.browserReceiptFields({
    files,
    contract,
    policy,
    target: session.target,
    evaluatorVersion: `browser-evidence@${kernelVersion}+${driver.name}@${driver.version}+${driver.browser}@${driver.browserVersion}`,
    verdict,
    taskId,
  });
  const resolvedHome = kernelHome(home);
  const { id, file, receipt } = issueReceipt(resolvedHome, fields);
  const { publicKey } = exportPublicKey(resolvedHome);
  const verification = verifyReceiptWithKey(publicKey, receipt, {}, { evidenceDir });

  return {
    url: JSON.parse(readFileSync(path.join(evidenceDir, 'manifest.json'), 'utf8')).url,
    verdict,
    assertions: session.assertions,
    evidence_folder: evidenceDir,
    evidence_files: files,
    grader: `scripted: starlight-kernel sessionVerdict@${kernelVersion}; no model judgement ran`,
    receipt_id: id,
    receipt_file: file,
    target: session.target,
    verified_with_exported_key: verification,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  for (const required of ['kernel', 'session', 'contract', 'policy', 'evidence', 'task-id']) {
    if (!args[required]) {
      console.error('usage: issue-receipt.mjs --kernel <starlight-kernel checkout> --session <dir> --contract <file> --policy <file> --evidence <new dir> --task-id <id> [--home <kernel home>]');
      process.exit(2);
    }
  }
  const result = await issueBrowserReceipt({
    kernel: path.resolve(args.kernel),
    sessionDir: path.resolve(args.session),
    contract: JSON.parse(readFileSync(args.contract, 'utf8')),
    policy: JSON.parse(readFileSync(args.policy, 'utf8')),
    evidenceDir: path.resolve(args.evidence),
    home: args.home,
    taskId: args['task-id'],
  });
  console.log(JSON.stringify(result, null, 2));
}
