// The calls to the ShipThis API - the only place this page sends anything.
//
// Never log a request body here: they hold the SRP values and the 2FA code.

import type {SrpChallenge, SrpProof, SrpProtocol} from './srp'

export interface SessionResponse {
  state: 'session'
  teams: {providerId: number; name: string}[]
  current: {providerId: number | null; roles: string[]}
}

export interface TwoFactorResponse {
  state: 'two-factor'
  phones: {id: number; number: string}[] // masked by Apple
  trustedDevices: boolean
  codeLength: number
  smsSentTo?: number // Apple already sent an SMS to this phone
}

export type SignInResponse = SessionResponse | TwoFactorResponse

export type VerifyTarget = {method: 'device'} | {method: 'phone'; phoneId: number}

// {error: code} from the API → what we show
const MESSAGES: Record<string, string> = {
  wrong_password: 'The Apple ID or password is not correct.',
  locked: 'Apple has locked this account. Unlock it at iforgot.apple.com.',
  apple_blocked: 'Apple did not allow this sign-in. Try again later.',
  privacy_ack: "Sign in once at appstoreconnect.apple.com to accept Apple's privacy notice. Then try again.",
  too_many_codes: 'Apple sent too many codes. Use the last code that you received, or wait and try again.',
  security_key_only:
    'Your account uses only security keys for two-factor authentication. Add a trusted phone number, or use the ShipThis CLI.',
  no_asc_access: 'This Apple ID has no access to App Store Connect.',
  wrong_code: 'That code is not correct. Try again.',
  rate_limited: 'Too many attempts. Wait 15 minutes and try again.',
  no_signin: 'Your Apple session has expired. Sign in again.',
  session_expired: 'Your Apple session has expired. Sign in again.',
  no_session: 'Your Apple session has expired. Sign in again.',
  not_configured: 'Apple sign-in is not available at the moment. Try again later.',
  apple_error: 'Apple returned an error. Try again later.',
  // Ours, not the API's
  link_expired: 'This link has expired. Go back to ShipThis and try again.',
  invalid: 'Something went wrong. Try again.',
  network: 'Could not reach ShipThis. Check your connection and try again.',
}

// These send you back to the sign in form
const SESSION_CODES = ['no_signin', 'session_expired', 'no_session']

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(MESSAGES[code] ?? MESSAGES.apple_error)
    this.name = 'ApiError'
  }

  get isSessionError() {
    return SESSION_CODES.includes(this.code)
  }

  get isLinkExpired() {
    return this.code === 'link_expired'
  }
}

// Apple can be slow, and the API waits for Apple, so this is generous
export const TIMEOUT_MS = 30_000

let apiUrl = ''
// The short-lived access token from the handoff. In memory only - never in storage.
let accessToken: string | null = null

export function setApiUrl(url: string) {
  apiUrl = url
}

function parseJson(text: string): any {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

async function call<T>(method: 'POST' | 'DELETE', path: string, body?: object, auth = true): Promise<T> {
  const headers: Record<string, string> = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (auth) {
    if (!accessToken) throw new ApiError('link_expired')
    headers.Authorization = `bearer ${accessToken}`
  }

  // The whole call - headers and body - must finish in time, or it counts as
  // not reaching the API. Never retried for you.
  let res: Response
  let text: string
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    text = await res.text()
  } catch {
    throw new ApiError('network')
  }

  const data = parseJson(text)
  if (res.ok) {
    // Every OK answer has a JSON body, except a 204
    if (res.status !== 204 && data === undefined) throw new ApiError('invalid', res.status)
    return data as T
  }

  if (data && typeof data.error === 'string') throw new ApiError(data.error, res.status)
  // A 401 with no {error} is the access token - the link has expired
  if (res.status === 401) throw new ApiError('link_expired', 401)
  // A 400 with a list of zod issues - our request was wrong
  if (res.status === 400) throw new ApiError('invalid', 400)
  throw new ApiError('apple_error', res.status)
}

// Swap the single-use token from the page URL for a short-lived access token
export async function handoff(token: string): Promise<void> {
  try {
    const data = await call<{accessToken: string}>('POST', '/auth/apple-handoff', {token}, false)
    accessToken = data.accessToken
  } catch (e) {
    // Whatever went wrong, the link can't be used
    if (e instanceof ApiError && e.code === 'network') throw e
    throw new ApiError('link_expired')
  }
}

export const signinInit = (body: {accountName: string; a: string; protocols: SrpProtocol[]}) =>
  call<SrpChallenge>('POST', '/me/apple/signin/init', body)

// Never retry this one - Apple locks accounts
export const signinComplete = (proof: SrpProof) => call<SignInResponse>('POST', '/me/apple/signin/complete', proof)

export const sendSms = (phoneId: number) => call<void>('POST', '/me/apple/2fa/phone', {phoneId})

export const verifyCode = (code: string, target: VerifyTarget) =>
  call<SessionResponse>('POST', '/me/apple/2fa/verify', {code, ...target})

export const deleteSession = () => call<void>('DELETE', '/me/apple/session')
