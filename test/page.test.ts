// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://connect.develop.shipth.is/"}

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

const API = 'https://api.develop.shipth.is/api/1.0.0'
const APP = 'https://develop.shipth.is'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
const noContent = () => new Response(null, {status: 204})

const session = {state: 'session', teams: [{providerId: 1, name: 'Team'}], current: {providerId: 1, roles: ['ADMIN']}}
const phones = [{id: 7, number: '+44 ••• •••••12'}]

// Each test gives its responses by "METHOD /path"
let routes: Record<string, (body: any) => Response>
let fetchMock: ReturnType<typeof vi.fn>
let navigate: ReturnType<typeof vi.fn<(url: string) => void>>
let app: HTMLElement

const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url.replace(API, '')}`)

async function open(hash: string) {
  vi.resetModules()
  history.replaceState(null, '', `/${hash}`)
  app = document.createElement('main')
  document.body.replaceChildren(app)
  const {start} = await import('../src/main')
  start(app, navigate)
}

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => app.querySelector<T>(selector)!
const text = () => app.textContent ?? ''
const until = (fn: () => unknown) => vi.waitFor(() => expect(fn()).toBeTruthy())

function type(selector: string, value: string) {
  const input = $<HTMLInputElement>(selector)
  input.value = value
  input.dispatchEvent(new Event('input'))
}
const submit = () => $<HTMLFormElement>('form').requestSubmit()
const click = (label: string) =>
  [...app.querySelectorAll<HTMLElement>('button, a')].find((el) => el.textContent === label)!.click()

async function signIn(password = 'secret') {
  await until(() => $('#password'))
  type('#apple-id', 'Me@Example.com')
  type('#password', password)
  submit()
}

beforeEach(() => {
  routes = {
    'POST /auth/apple-handoff': () => json(200, {jwt: 'scoped'}),
    'POST /me/apple/signin/init': () => json(200, {salt: 'c2E=', iterations: 1000, b: 'Qg==', protocol: 's2k'}),
    'POST /me/apple/signin/complete': () => json(200, session),
    'POST /me/apple/2fa/phone': () => noContent(),
    'POST /me/apple/2fa/verify': () => json(200, session),
    'DELETE /me/apple/session': () => noContent(),
  }
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const route = routes[`${init.method} ${url.replace(API, '')}`]
    if (!route) throw new Error(`no route for ${init.method} ${url}`)
    return route(init.body && JSON.parse(init.body as string))
  })
  vi.stubGlobal('fetch', fetchMock)
  navigate = vi.fn<(url: string) => void>()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('start', () => {
  test('takes the token out of the address bar straight away', async () => {
    await open('#token=abc&return=/games/x/setup/ios')
    expect(location.hash).toBe('')
    await until(() => $('#password'))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({token: 'abc'})
  })

  test('no token - link expired, no calls', async () => {
    await open('#return=/games/x/setup/ios')
    expect(text()).toContain('This link has expired')
    expect($<HTMLAnchorElement>('a').href).toBe(`${APP}/games/x/setup/ios`)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('a used token - link expired', async () => {
    routes['POST /auth/apple-handoff'] = () => json(401, {error: 'invalid_token'})
    await open('#token=used')
    await until(() => text().includes('This link has expired'))
  })

  test('a bad return path goes to the dashboard', async () => {
    await open('#token=abc&return=//evil.com')
    await signIn()
    await until(() => navigate.mock.calls.length)
    expect(navigate).toHaveBeenCalledWith(`${APP}/dashboard`)
  })
})

describe('sign in', () => {
  test('no two-factor - straight back to the app', async () => {
    await open('#token=abc&return=/games/x/setup/ios')
    await signIn()
    await until(() => navigate.mock.calls.length)
    expect(navigate).toHaveBeenCalledWith(`${APP}/games/x/setup/ios`)
    expect(calls()).toEqual(['POST /auth/apple-handoff', 'POST /me/apple/signin/init', 'POST /me/apple/signin/complete'])
  })

  test('sends the normalized Apple ID and never the password', async () => {
    await open('#token=abc')
    await signIn('secret')
    await until(() => navigate.mock.calls.length)
    const bodies = fetchMock.mock.calls.map(([, init]) => String(init.body ?? ''))
    expect(bodies.join()).not.toContain('secret')
    expect(JSON.parse(bodies[1]).accountName).toBe('me@example.com')
  })

  test('wrong password - shows the error, clears the password, does not retry', async () => {
    routes['POST /me/apple/signin/complete'] = () => json(401, {error: 'wrong_password'})
    await open('#token=abc')
    await signIn()
    await until(() => text().includes('The Apple ID or password is not correct.'))
    expect($<HTMLInputElement>('#password').value).toBe('')
    expect(calls().filter((c) => c.endsWith('/signin/complete'))).toHaveLength(1)
    expect($<HTMLButtonElement>('button[type=submit]').disabled).toBe(false)
  })

  test('clears the password when the proof fails too', async () => {
    await open('#token=abc')
    await signIn('throw')
    await until(() => text().includes('Something went wrong'))
    expect($<HTMLInputElement>('#password').value).toBe('')
    expect(calls()).not.toContain('POST /me/apple/signin/complete')
  })

  test('cancel - deletes the session and goes back', async () => {
    await open('#token=abc&return=/games/x/setup/ios')
    await until(() => $('#password'))
    click('Cancel')
    await until(() => navigate.mock.calls.length)
    expect(calls()).toContain('DELETE /me/apple/session')
    expect(navigate).toHaveBeenCalledWith(`${APP}/games/x/setup/ios`)
  })

  test('the JWT expires - link expired', async () => {
    routes['POST /me/apple/signin/init'] = () => new Response('Unauthorized', {status: 401})
    await open('#token=abc')
    await signIn()
    await until(() => text().includes('This link has expired'))
  })
})

describe('two-factor', () => {
  const twoFactor = (extra: object) => () =>
    json(200, {state: 'two-factor', phones, trustedDevices: false, codeLength: 6, ...extra})

  test('Apple already sent an SMS - code box, no extra SMS', async () => {
    routes['POST /me/apple/signin/complete'] = twoFactor({smsSentTo: 7})
    await open('#token=abc&return=/games/x/setup/ios')
    await signIn()
    await until(() => $('#code'))
    expect(text()).toContain('We sent a code to +44 ••• •••••12.')
    expect($('#code').getAttribute('maxlength')).toBe('6')

    type('#code', '12a3456')
    expect($<HTMLInputElement>('#code').value).toBe('123456')
    submit()
    await until(() => navigate.mock.calls.length)
    expect(calls()).not.toContain('POST /me/apple/2fa/phone')
    const verify = fetchMock.mock.calls.find(([url]) => url.endsWith('/2fa/verify'))!
    expect(JSON.parse(verify[1].body)).toEqual({code: '123456', method: 'phone', phoneId: 7})
  })

  test('trusted device, then "Text me instead"', async () => {
    routes['POST /me/apple/signin/complete'] = twoFactor({trustedDevices: true})
    await open('#token=abc')
    await signIn()
    await until(() => text().includes('Enter the code that shows on your Apple device.'))

    click('Text me instead')
    await until(() => text().includes('Select a phone'))
    click('+44 ••• •••••12')
    await until(() => $('#code'))
    expect(calls()).toContain('POST /me/apple/2fa/phone')

    click('Resend code')
    await until(() => calls().filter((c) => c.endsWith('/2fa/phone')).length === 2)
  })

  test('device code is sent as a device code', async () => {
    routes['POST /me/apple/signin/complete'] = twoFactor({trustedDevices: true})
    await open('#token=abc')
    await signIn()
    await until(() => $('#code'))
    type('#code', '654321')
    submit()
    await until(() => navigate.mock.calls.length)
    const verify = fetchMock.mock.calls.find(([url]) => url.endsWith('/2fa/verify'))!
    expect(JSON.parse(verify[1].body)).toEqual({code: '654321', method: 'device'})
  })

  test('wrong code - stays on the code box', async () => {
    routes['POST /me/apple/signin/complete'] = twoFactor({smsSentTo: 7})
    routes['POST /me/apple/2fa/verify'] = () => json(400, {error: 'wrong_code'})
    await open('#token=abc')
    await signIn()
    await until(() => $('#code'))
    type('#code', '000000')
    submit()
    await until(() => text().includes('That code is not correct. Try again.'))
    expect($('#code')).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  test('the Apple session expires - back to sign in with the message', async () => {
    routes['POST /me/apple/signin/complete'] = twoFactor({smsSentTo: 7})
    routes['POST /me/apple/2fa/verify'] = () => json(400, {error: 'session_expired'})
    await open('#token=abc')
    await signIn()
    await until(() => $('#code'))
    type('#code', '000000')
    submit()
    await until(() => $('#password'))
    expect(text()).toContain('Your Apple session has expired. Sign in again.')
  })
})
