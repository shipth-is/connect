import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

type Api = typeof import('../src/api')

const API = 'https://api.example.test/api/1.0.0'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})

let fetchMock: ReturnType<typeof vi.fn>
let api: Api

// A fresh module each time - the JWT lives in module state
beforeEach(async () => {
  vi.resetModules()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  api = await import('../src/api')
  api.setApiUrl(API)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const signedIn = async () => {
  fetchMock.mockResolvedValueOnce(json(200, {jwt: 'scoped-jwt'}))
  await api.handoff('t0k3n')
  fetchMock.mockClear()
}

describe('handoff', () => {
  test('swaps the token for a JWT, then sends it on the next call', async () => {
    fetchMock.mockResolvedValueOnce(json(200, {jwt: 'scoped-jwt'}))
    await api.handoff('t0k3n')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/auth/apple-handoff`)
    expect(init.headers.Authorization).toBeUndefined()
    expect(JSON.parse(init.body)).toEqual({token: 't0k3n'})

    fetchMock.mockResolvedValueOnce(new Response(null, {status: 204}))
    await api.deleteSession()
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('bearer scoped-jwt')
  })

  test('any failure means the link expired', async () => {
    fetchMock.mockResolvedValueOnce(json(401, {error: 'whatever'}))
    await expect(api.handoff('used')).rejects.toMatchObject({code: 'link_expired'})
  })

  test('a call before the handoff fails without hitting the network', async () => {
    await expect(api.sendSms(1)).rejects.toMatchObject({code: 'link_expired'})
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('calls', () => {
  beforeEach(signedIn)

  test('each call goes to the right endpoint with the right body', async () => {
    fetchMock.mockImplementation(async () => json(200, {}))
    await api.signinInit({accountName: 'a@b.c', a: 'QQ==', protocols: ['s2k', 's2k_fo']})
    await api.signinComplete({m1: 'MQ==', m2: 'Mg=='})
    await api.verifyCode('123456', {method: 'device'})
    await api.verifyCode('123456', {method: 'phone', phoneId: 2})
    fetchMock.mockImplementation(async () => new Response(null, {status: 204}))
    await api.sendSms(2)
    await api.deleteSession()

    const calls = fetchMock.mock.calls.map(([url, init]) => [init.method, url.replace(API, ''), init.body && JSON.parse(init.body)])
    expect(calls).toEqual([
      ['POST', '/me/apple/signin/init', {accountName: 'a@b.c', a: 'QQ==', protocols: ['s2k', 's2k_fo']}],
      ['POST', '/me/apple/signin/complete', {m1: 'MQ==', m2: 'Mg=='}],
      ['POST', '/me/apple/2fa/verify', {code: '123456', method: 'device'}],
      ['POST', '/me/apple/2fa/verify', {code: '123456', method: 'phone', phoneId: 2}],
      ['POST', '/me/apple/2fa/phone', {phoneId: 2}],
      ['DELETE', '/me/apple/session', undefined],
    ])
  })

  test('never sends cookies', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, {status: 204}))
    await api.deleteSession()
    expect(fetchMock.mock.calls[0][1].credentials).toBe('omit')
  })

  test('signin/complete is called once, even when it fails', async () => {
    fetchMock.mockResolvedValue(json(401, {error: 'wrong_password'}))
    await expect(api.signinComplete({m1: 'x', m2: 'y'})).rejects.toMatchObject({code: 'wrong_password'})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('errors', () => {
  beforeEach(signedIn)

  const failWith = async (res: Response | Error) => {
    if (res instanceof Error) fetchMock.mockRejectedValueOnce(res)
    else fetchMock.mockResolvedValueOnce(res)
    return api.sendSms(1).catch((e) => e)
  }

  test('an API error code gets its message', async () => {
    const e = await failWith(json(403, {error: 'locked'}))
    expect(e).toBeInstanceOf(api.ApiError)
    expect(e.code).toBe('locked')
    expect(e.message).toBe('Apple has locked this account. Unlock it at iforgot.apple.com.')
  })

  test('an unknown code gets the generic Apple message', async () => {
    const e = await failWith(json(502, {error: 'something_new'}))
    expect(e.message).toBe('Apple returned an error. Try again later.')
  })

  test('session codes send you back to sign in', async () => {
    for (const code of ['no_signin', 'session_expired', 'no_session']) {
      expect((await failWith(json(400, {error: code}))).isSessionError).toBe(true)
    }
    expect((await failWith(json(400, {error: 'wrong_code'}))).isSessionError).toBe(false)
  })

  test('a 401 with no error code means the link expired', async () => {
    const e = await failWith(new Response('Unauthorized', {status: 401}))
    expect(e.isLinkExpired).toBe(true)
  })

  test('a 400 with zod issues is our fault', async () => {
    const e = await failWith(json(400, [{code: 'invalid_type', path: ['phoneId']}]))
    expect(e.code).toBe('invalid')
    expect(e.message).toBe('Something went wrong. Try again.')
  })

  test('no connection', async () => {
    const e = await failWith(new TypeError('Failed to fetch'))
    expect(e.code).toBe('network')
  })
})
