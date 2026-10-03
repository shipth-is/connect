import {describe, expect, test} from 'vitest'

import {DEFAULT_RETURN_PATH, getReturnPath, getReturnUrl} from '../src/returnPath'

describe('getReturnPath', () => {
  test('accepts a path on the app', () => {
    expect(getReturnPath('/games/x/setup/ios')).toBe('/games/x/setup/ios')
    expect(getReturnPath('/games/x/setup/ios?source=godot&capabilities=GAME_CENTER')).toBe(
      '/games/x/setup/ios?source=godot&capabilities=GAME_CENTER',
    )
  })

  test('rejects anything else', () => {
    const bad = [
      '//evil.com',
      'https://evil.com',
      '/\\evil.com',
      '\\\\evil.com',
      'javascript:alert(1)',
      'games/x',
      '/\t/evil.com',
      '/\n/evil.com',
      '',
      null,
      undefined,
    ]
    for (const value of bad) expect(getReturnPath(value)).toBe(DEFAULT_RETURN_PATH)
  })
})

describe('getReturnUrl', () => {
  test('stays on the app origin', () => {
    expect(getReturnUrl('https://shipth.is', '/games/x/setup/ios')).toBe('https://shipth.is/games/x/setup/ios')
  })

  test('falls back if the path somehow leaves the app', () => {
    expect(getReturnUrl('https://shipth.is', '//evil.com')).toBe('https://shipth.is/dashboard')
  })
})
