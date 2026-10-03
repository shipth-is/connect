import {describe, expect, test} from 'vitest'

import {getConfig} from '../src/config'

describe('getConfig', () => {
  test('prod', () => {
    expect(getConfig('connect.shipth.is')).toEqual({
      apiUrl: 'https://api.shipth.is/api/1.0.0',
      appOrigin: 'https://shipth.is',
    })
  })

  test('develop', () => {
    expect(getConfig('connect.develop.shipth.is')).toEqual({
      apiUrl: 'https://api.develop.shipth.is/api/1.0.0',
      appOrigin: 'https://develop.shipth.is',
    })
  })

  test('local', () => {
    expect(getConfig('localhost')?.appOrigin).toBe('http://localhost:3000')
    expect(getConfig('127.0.0.1')?.appOrigin).toBe('http://localhost:3000')
  })

  test('any other host gets nothing', () => {
    for (const host of ['evil.com', 'shipth.is', 'connect.shipth.is.evil.com', 'toString', '__proto__', '']) {
      expect(getConfig(host)).toBeNull()
    }
  })
})
