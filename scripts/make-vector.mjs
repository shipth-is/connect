// Makes test/srp-vector.json - a fixed SRP test vector for test/srp.test.ts.
//
// This is a separate copy of the maths in src/srp.ts. It uses the Node build
// of @foxt/js-srp and Node's crypto, so the test checks srp.ts against it.
// All the inputs are made up - there is no real account or password here.
//
//   node scripts/make-vector.mjs > test/srp-vector.json

import crypto from 'node:crypto'
import {Hash, Mode, Srp, util} from '@foxt/js-srp'

// Fixed inputs. `a` is the client secret and `b` is the server public value.
const fixed = {
  accountName: 'test@example.com',
  password: 'not-a-real-password',
  a: 0x5f2c1c8bd4a7e39b16f0a2c4d8e6b1a3c5e7f9021436587a9bcdef0123456789n,
  salt: Buffer.from('connect-test-salt').toString('base64'),
  iterations: 1000,
  b: Buffer.from(crypto.createHash('sha512').update('connect-test-b').digest()).toString('base64'),
}

async function derivePassword(srp, protocol) {
  let p = new Uint8Array(await util.hash(srp.h, Buffer.from(fixed.password)))
  if (protocol === 's2k_fo') p = Buffer.from(util.toHex(p))
  return new Uint8Array(
    crypto.pbkdf2Sync(p, Buffer.from(fixed.salt, 'base64'), fixed.iterations, 32, 'sha256'),
  )
}

async function makeCase(protocol) {
  const srp = new Srp(Mode.GSA, Hash.SHA256, 2048)
  const client = await srp.newClient(Buffer.from(fixed.accountName), new Uint8Array(), fixed.a)
  const a = Buffer.from(util.bytesFromBigint(client.A)).toString('base64')
  client.p = await derivePassword(srp, protocol)
  const m1 = Buffer.from(
    await client.generate(Buffer.from(fixed.salt, 'base64'), Buffer.from(fixed.b, 'base64')),
    'hex',
  ).toString('base64')
  const m2 = Buffer.from(await client.generateM2()).toString('base64')
  return {protocol, a, m1, m2}
}

const vector = {
  accountName: fixed.accountName,
  password: fixed.password,
  a: fixed.a.toString(16),
  salt: fixed.salt,
  iterations: fixed.iterations,
  b: fixed.b,
  cases: [await makeCase('s2k'), await makeCase('s2k_fo')],
}

console.log(JSON.stringify(vector, null, 2))
