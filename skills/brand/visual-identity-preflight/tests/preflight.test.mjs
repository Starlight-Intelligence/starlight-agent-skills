import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const adapter = fileURLToPath(new URL('../preflight.mjs',import.meta.url))
const q = {identity_id:'custom.nilo',variant:'reference-sheet',channel:'internal',intended_use:'identity reference',required_approval:'identity'}
const hash = 'a'.repeat(64)
const good = {...q,status:'resolved',sha256:hash,immutable_master:'urn:sha256:'+hash,source_authority:'test-owner',asset_id:'sheet',approved_version:'1',approval_state:'approved_identity',rights:{permitted_uses:['internal identity review']},publish_authorized:false}
function run(root, query) {
  const result = spawnSync(process.execPath,[adapter],{env:{...process.env,VIS_RUNTIME_ROOT:root},input:JSON.stringify(query),encoding:'utf8'})
  return [result.status,JSON.parse(result.stdout).status]
}
test('shell clients fail closed when VIS is disconnected', () => assert.deepEqual(run('',q),[3,'unresolved']))
test('the adapter binds the scope and the original even for shared folios', t => {
  const root=mkdtempSync(join(tmpdir(),'skill-vis-'))
  t.after(()=>rmSync(root,{recursive:true,force:true}))
  mkdirSync(join(root,'bin'))
  writeFileSync(join(root,'bin/vis-identity.mjs'),'console.log('+JSON.stringify(JSON.stringify(good))+')')
  assert.deepEqual(run(root,q),[0,'resolved'])
  for (const change of [{identity_id:'custom.riff'},{expected_sha256:'b'.repeat(64)},{expected_version:'2'},{channel:'social'},{required_approval:'publication'}]) {
    assert.deepEqual(run(root,{...q,...change}),[3,'unresolved'])
  }
})
