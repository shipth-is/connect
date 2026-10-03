import {describe, expect, test} from 'vitest'

import * as srp from '../src/srp'
import vector from './srp-vector.json'

// The vector comes from scripts/make-vector.mjs, a separate copy of the maths
describe('srp', () => {
  for (const c of vector.cases) {
    test(`matches the vector for ${c.protocol}`, async () => {
      const client = await srp.init(vector.accountName, BigInt(`0x${vector.a}`))
      expect(client.a).toBe(c.a)

      const proof = await client.proof(vector.password, {
        salt: vector.salt,
        iterations: vector.iterations,
        protocol: c.protocol as srp.SrpProtocol,
        b: vector.b,
      })
      expect(proof.m1).toBe(c.m1)
      expect(proof.m2).toBe(c.m2)
    })
  }

  test('normalizes the account name', async () => {
    const client = await srp.init('  Test@Example.COM ')
    expect(client.accountName).toBe('test@example.com')
  })
})
