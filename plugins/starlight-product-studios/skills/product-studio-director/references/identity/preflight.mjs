// Thin shell adapter to the installed VIS runtime. No registry or remote fallback.
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const unresolved = reason => ({status:'unresolved', reason, publish_authorized:false})

function preflight(query) {
  const root = process.env.VIS_RUNTIME_ROOT
  if (!root || !isAbsolute(root)) return unresolved('vis_runtime_unavailable')
  const result = spawnSync(process.execPath, [join(root, 'bin/vis-identity.mjs')], {
    input:JSON.stringify(query), encoding:'utf8', timeout:12_000, maxBuffer:512_000
  })
  let receipt
  try { receipt = JSON.parse(result.stdout) } catch { return unresolved('vis_runtime_unavailable') }
  if (result.status === 3 && receipt?.status === 'unresolved') return unresolved(receipt.reason)
  const fields = ['identity_id','variant','intended_use','channel']
  if (result.status !== 0 || query?.required_approval !== 'identity' ||
      receipt?.status !== 'resolved' || receipt.publish_authorized !== false ||
      !fields.every(key => typeof query[key] === 'string' && query[key] === receipt[key]) ||
      !/^[a-f0-9]{64}$/.test(receipt.sha256) || receipt.immutable_master !== 'urn:sha256:' + receipt.sha256 ||
      !receipt.approved_version || !receipt.asset_id || !receipt.approval_state || !receipt.source_authority ||
      !receipt.rights?.permitted_uses?.length ||
      (query.expected_sha256 !== undefined && query.expected_sha256 !== receipt.sha256) ||
      (query.expected_version !== undefined && query.expected_version !== receipt.approved_version)) {
    return unresolved('invalid_identity_receipt')
  }
  return receipt
}

let result
try { result = preflight(JSON.parse(readFileSync(0, 'utf8'))) }
catch { result = unresolved('invalid_request') }
console.log(JSON.stringify(result))
process.exitCode = result.status === 'resolved' ? 0 : 3
