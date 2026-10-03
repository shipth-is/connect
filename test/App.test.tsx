// @vitest-environment jsdom

import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

// The SRP maths has its own tests - here we only need it to give values back
vi.mock('../src/srp', () => ({
  init: vi.fn(async (accountName: string) => ({
    accountName: accountName.toLowerCase().trim(),
    protocols: ['s2k', 's2k_fo'],
    a: 'QQ==',
    proof: vi.fn(async (password: string) => {
      if (password === 'throw') throw new Error('bad challenge')
      return {m1: 'TTE=', m2: 'TTI='}
    }),
  })),
}))

const API = 'https://api.example.test/api/1.0.0'
const RETURN_URL = 'https://develop.shipth.is/games/x/setup/ios'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
const noContent = () => new Response(null, {status: 204})

const session = {state: 'session', teams: [{providerId: 1, name: 'Team'}], current: {providerId: 1, roles: ['ADMIN']}}
const phones = [{id: 7, number: '+44 ••• •••••12'}]
const twoFactor = (extra: object) => () =>
  json(200, {state: 'two-factor', phones, trustedDevices: false, codeLength: 6, ...extra})

// Each test sets its API responses by "METHOD /path"
let routes: Record<string, () => Response>
let fetchMock: ReturnType<typeof vi.fn>
let navigate: ReturnType<typeof vi.fn<(url: string) => void>>

const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url.replace(API, '')}`)
const bodyOf = (path: string) => JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith(path))![1].body)

async function open(token: string | null = 'abc') {
  // A fresh api module each time - the access token lives in module state
  vi.resetModules()
  const api = await import('../src/api')
  api.setApiUrl(API)
  const {App} = await import('../src/App')
  render(<App token={token} returnUrl={RETURN_URL} navigate={navigate} />)
  return userEvent.setup()
}

async function signIn(password = 'secret') {
  const user = await open()
  await user.type(await screen.findByLabelText('Apple ID'), 'Me@Example.com')
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', {name: 'Sign in'}))
  return user
}

beforeEach(() => {
  routes = {
    'POST /auth/apple-handoff': () => json(200, {accessToken: 'st-connect:abc', expiresAt: '2026-10-03T12:15:00Z'}),
    'POST /me/apple/signin/init': () => json(200, {salt: 'c2E=', iterations: 1000, b: 'Qg==', protocol: 's2k'}),
    'POST /me/apple/signin/complete': () => json(200, session),
    'POST /me/apple/2fa/phone': () => noContent(),
    'POST /me/apple/2fa/verify': () => json(200, session),
    'DELETE /me/apple/session': () => noContent(),
  }
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const route = routes[`${init.method} ${url.replace(API, '')}`]
    if (!route) throw new Error(`no route for ${init.method} ${url}`)
    return route()
  })
  vi.stubGlobal('fetch', fetchMock)
  navigate = vi.fn<(url: string) => void>()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('start', () => {
  test('swaps the token once', async () => {
    await open('abc')
    await screen.findByLabelText('Password')
    expect(calls()).toEqual(['POST /auth/apple-handoff'])
    expect(bodyOf('/auth/apple-handoff')).toEqual({token: 'abc'})
  })

  test('no token - link expired, no calls', async () => {
    await open(null)
    expect(screen.getByRole('heading', {name: 'This link has expired'})).toBeTruthy()
    expect(screen.getByRole('link', {name: 'Go back to ShipThis'}).getAttribute('href')).toBe(RETURN_URL)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('a used token - link expired', async () => {
    routes['POST /auth/apple-handoff'] = () => json(401, {error: 'invalid_token'})
    await open('used')
    await screen.findByRole('heading', {name: 'This link has expired'})
  })
})

describe('sign in', () => {
  test('no two-factor - straight back to the app', async () => {
    await signIn()
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(RETURN_URL))
    expect(calls()).toEqual(['POST /auth/apple-handoff', 'POST /me/apple/signin/init', 'POST /me/apple/signin/complete'])
  })

  test('sends the normalized Apple ID and never the password', async () => {
    await signIn('secret')
    await waitFor(() => expect(navigate).toHaveBeenCalled())
    const bodies = fetchMock.mock.calls.map(([, init]) => String(init.body ?? ''))
    expect(bodies.join()).not.toContain('secret')
    expect(bodyOf('/signin/init').accountName).toBe('me@example.com')
  })

  test('wrong password - shows the error, clears the password, does not retry', async () => {
    routes['POST /me/apple/signin/complete'] = () => json(401, {error: 'wrong_password'})
    await signIn()
    expect((await screen.findByRole('alert')).textContent).toBe('The Apple ID or password is not correct.')
    expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('')
    expect(calls().filter((c) => c.endsWith('/signin/complete'))).toHaveLength(1)
    expect(screen.getByRole<HTMLButtonElement>('button', {name: 'Sign in'}).disabled).toBe(false)
  })

  test('clears the password when the proof fails too', async () => {
    await signIn('throw')
    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong. Try again.')
    expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('')
    expect(calls()).not.toContain('POST /me/apple/signin/complete')
  })

  test('cancel - deletes the session and goes back', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', {name: 'Cancel'}))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(RETURN_URL))
    expect(calls()).toContain('DELETE /me/apple/session')
  })

  test('the access token expires - link expired', async () => {
    routes['POST /me/apple/signin/init'] = () => new Response('Unauthorized', {status: 401})
    await signIn()
    await screen.findByRole('heading', {name: 'This link has expired'})
  })
})

describe('two-factor', () => {
  test('Apple already sent an SMS - code box, no extra SMS', async () => {
    routes['POST /me/apple/signin/complete'] = twoFactor({smsSentTo: 7})
    const user = await signIn()
    await screen.findByText('We sent a code to +44 ••• •••••12.')
    const code = screen.getByLabelText<HTMLInputElement>('Code')
    expect(code.maxLength).toBe(6)

    await user.type(code, '12a3456')
    expect(code.value).toBe('123456')
    await user.click(screen.getByRole('button', {name: 'Verify'}))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(RETURN_URL))
    expect(calls()).not.toContain('POST /me/apple/2fa/phone')
    expect(bodyOf('/2fa/verify')).toEqual({code: '123456', method: 'phone', phoneId: 7})
  })

  test('trusted device, then "Text me instead", then resend', async () => {
    routes['POST /me/apple/signin/complete'] = twoFactor({trustedDevices: true})
    const user = await signIn()
    await screen.findByText('Enter the code that shows on your Apple device.')

    await user.click(screen.getByRole('button', {name: 'Text me instead'}))
    await user.click(await screen.findByRole('button', {name: '+44 ••• •••••12'}))
    await screen.findByText('We sent a code to +44 ••• •••••12.')
    expect(bodyOf('/2fa/phone')).toEqual({phoneId: 7})

    await user.click(screen.getByRole('button', {name: 'Resend code'}))
    await waitFor(() => expect(calls().filter((c) => c.endsWith('/2fa/phone'))).toHaveLength(2))
  })

  test('device code is sent as a device code', async () => {
    routes['POST /me/apple/signin/complete'] = twoFactor({trustedDevices: true})
    const user = await signIn()
    await user.type(await screen.findByLabelText('Code'), '654321')
    await user.click(screen.getByRole('button', {name: 'Verify'}))
    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(bodyOf('/2fa/verify')).toEqual({code: '654321', method: 'device'})
  })

  test('wrong code - stays on the code box', async () => {
    routes['POST /me/apple/signin/complete'] = twoFactor({smsSentTo: 7})
    routes['POST /me/apple/2fa/verify'] = () => json(400, {error: 'wrong_code'})
    const user = await signIn()
    await user.type(await screen.findByLabelText('Code'), '000000')
    await user.click(screen.getByRole('button', {name: 'Verify'}))
    expect((await screen.findByRole('alert')).textContent).toBe('That code is not correct. Try again.')
    expect(screen.getByLabelText('Code')).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  test('the Apple session expires - back to sign in with the message', async () => {
    routes['POST /me/apple/signin/complete'] = twoFactor({smsSentTo: 7})
    routes['POST /me/apple/2fa/verify'] = () => json(400, {error: 'session_expired'})
    const user = await signIn()
    await user.type(await screen.findByLabelText('Code'), '000000')
    await user.click(screen.getByRole('button', {name: 'Verify'}))
    await screen.findByLabelText('Password')
    expect(screen.getByRole('alert').textContent).toBe('Your Apple session has expired. Sign in again.')
  })
})
