// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://connect.develop.shipth.is/"}

import {expect, test} from 'vitest'

import {readLink} from '../src/link'

const APP = 'https://develop.shipth.is'

test('reads the link and takes it out of the address bar', () => {
  history.replaceState(null, '', '/#token=abc&return=/games/x/setup/ios')
  expect(readLink(APP)).toEqual({token: 'abc', returnUrl: `${APP}/games/x/setup/ios`})
  expect(location.hash).toBe('')
  expect(location.href).toBe('https://connect.develop.shipth.is/')
})

test('no token, bad return path', () => {
  history.replaceState(null, '', '/#return=//evil.com')
  expect(readLink(APP)).toEqual({token: null, returnUrl: `${APP}/dashboard`})
})
