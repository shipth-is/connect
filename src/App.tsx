// The page: swap the token, sign in, two-factor, go back to ShipThis.
// See docs/PLAN.md section 4.

import {type FormEvent, useEffect, useRef, useState} from 'react'

import * as api from './api'
import * as srp from './srp'

type Step =
  | {name: 'connecting'}
  | {name: 'link-expired'}
  | {name: 'error'; message: string}
  | {name: 'sign-in'; error?: string}
  | {name: 'two-factor'; twoFactor: api.TwoFactorResponse}

interface Props {
  token: string | null
  returnUrl: string
  navigate: (url: string) => void
}

export function App({token, returnUrl, navigate}: Props) {
  const [step, setStep] = useState<Step>(token ? {name: 'connecting'} : {name: 'link-expired'})
  const started = useRef(false)

  useEffect(() => {
    // The token is single-use, so only ever swap it once
    if (!token || started.current) return
    started.current = true
    api.handoff(token).then(
      () => setStep({name: 'sign-in'}),
      (e) =>
        setStep(
          e instanceof api.ApiError && e.code === 'network' ? {name: 'error', message: e.message} : {name: 'link-expired'},
        ),
    )
  }, [token])

  const goBack = () => navigate(returnUrl)

  const cancel = async () => {
    // The server deletes the session after a while anyway, so errors don't matter
    await api.deleteSession().catch(() => {})
    goBack()
  }

  // Errors which move you to another step. Returns the message to show on
  // this step, or null if we moved.
  const handleError = (e: unknown): string | null => {
    if (e instanceof api.ApiError && e.isLinkExpired) {
      setStep({name: 'link-expired'})
      return null
    }
    if (e instanceof api.ApiError && e.isSessionError) {
      setStep({name: 'sign-in', error: e.message})
      return null
    }
    return e instanceof api.ApiError ? e.message : 'Something went wrong. Try again.'
  }

  const onSignedIn = (response: api.SignInResponse) => {
    if (response.state === 'session') goBack()
    else setStep({name: 'two-factor', twoFactor: response})
  }

  switch (step.name) {
    case 'connecting':
      return <Message title="Connecting" text="One moment…" />
    case 'link-expired':
      return (
        <Message
          title="This link has expired"
          text="This link has expired. Go back to ShipThis and try again."
          link={returnUrl}
        />
      )
    case 'error':
      return <Message title="Something is wrong" text={step.message} link={returnUrl} />
    case 'sign-in':
      return (
        <SignIn
          initialError={step.error}
          onSignedIn={onSignedIn}
          onCancel={cancel}
          handleError={handleError}
        />
      )
    case 'two-factor':
      return <TwoFactor twoFactor={step.twoFactor} onVerified={goBack} onCancel={cancel} handleError={handleError} />
  }
}

// Runs one API call at a time for a step, with its error
function useCall(handleError: (e: unknown) => string | null, initialError?: string) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError ?? '')

  const call = async (fn: () => Promise<void>) => {
    if (busy) return false
    setBusy(true)
    setError('')
    try {
      await fn()
      return true
    } catch (e) {
      const message = handleError(e)
      if (message) setError(message)
      return false
    } finally {
      setBusy(false)
    }
  }

  return {busy, error, call}
}

interface SignInProps {
  initialError?: string
  onSignedIn: (response: api.SignInResponse) => void
  onCancel: () => void
  handleError: (e: unknown) => string | null
}

function SignIn({initialError, onSignedIn, onCancel, handleError}: SignInProps) {
  const [accountName, setAccountName] = useState('')
  const [password, setPassword] = useState('')
  const {busy, error, call} = useCall(handleError, initialError)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    call(async () => {
      const client = await srp.init(accountName)
      const challenge = await api.signinInit({
        accountName: client.accountName,
        a: client.a,
        protocols: client.protocols,
      })
      let proof: srp.SrpProof
      try {
        proof = await client.proof(password, challenge)
      } finally {
        // The password is not needed after the proof, whatever happened
        setPassword('')
      }
      // Never retried - Apple locks accounts
      onSignedIn(await api.signinComplete(proof))
    })
  }

  return (
    <form onSubmit={submit} aria-busy={busy}>
      <h1>Sign in to Apple</h1>
      <div id="notice" />
      <ErrorText error={error} />
      <label htmlFor="apple-id">Apple ID</label>
      <input
        id="apple-id"
        type="email"
        name="username"
        autoComplete="username"
        maxLength={254}
        required
        disabled={busy}
        value={accountName}
        onChange={(e) => setAccountName(e.target.value)}
      />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        disabled={busy}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="buttons">
        <button type="submit" disabled={busy}>
          Sign in
        </button>
        <CancelButton onCancel={onCancel} disabled={busy} />
      </div>
    </form>
  )
}

interface TwoFactorProps {
  twoFactor: api.TwoFactorResponse
  onVerified: () => void
  onCancel: () => void
  handleError: (e: unknown) => string | null
}

function firstTarget(twoFactor: api.TwoFactorResponse): api.VerifyTarget | null {
  // Apple has already sent an SMS - don't send another one
  if (twoFactor.smsSentTo !== undefined) return {method: 'phone', phoneId: twoFactor.smsSentTo}
  if (twoFactor.trustedDevices) return {method: 'device'}
  return null
}

function TwoFactor({twoFactor, onVerified, onCancel, handleError}: TwoFactorProps) {
  const {phones, codeLength} = twoFactor
  // null: pick a phone first
  const [target, setTarget] = useState(() => firstTarget(twoFactor))
  const [code, setCode] = useState('')
  const {busy, error, call} = useCall(handleError)

  const sendSms = (phoneId: number) =>
    call(async () => {
      await api.sendSms(phoneId)
      setTarget({method: 'phone', phoneId})
    })

  if (!target) {
    return (
      <div>
        <h1>Two-factor authentication</h1>
        <p>Select a phone to get a code.</p>
        <ErrorText error={error} />
        <div className="phones">
          {phones.map((phone) => (
            <button key={phone.id} type="button" disabled={busy} onClick={() => sendSms(phone.id)}>
              {phone.number}
            </button>
          ))}
        </div>
        <div className="buttons">
          <CancelButton onCancel={onCancel} disabled={busy} />
        </div>
      </div>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!code) return
    call(async () => {
      await api.verifyCode(code, target)
      onVerified()
    })
  }

  const phone = target.method === 'phone' ? phones.find((p) => p.id === target.phoneId) : undefined

  return (
    <form onSubmit={submit} aria-busy={busy}>
      <h1>Two-factor authentication</h1>
      <p>
        {target.method === 'device'
          ? 'Enter the code that shows on your Apple device.'
          : `We sent a code to ${phone?.number ?? 'your phone'}.`}
      </p>
      <ErrorText error={error} />
      <label htmlFor="code">Code</label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={codeLength}
        required
        autoFocus
        disabled={busy}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
      <p className="links">
        {target.method === 'device' && phones.length > 0 && (
          <button type="button" className="link" disabled={busy} onClick={() => setTarget(null)}>
            Text me instead
          </button>
        )}
        {target.method === 'phone' && (
          <button type="button" className="link" disabled={busy} onClick={() => sendSms(target.phoneId)}>
            Resend code
          </button>
        )}
      </p>
      <div className="buttons">
        <button type="submit" disabled={busy}>
          Verify
        </button>
        <CancelButton onCancel={onCancel} disabled={busy} />
      </div>
    </form>
  )
}

function Message({title, text, link}: {title: string; text: string; link?: string}) {
  return (
    <div>
      <h1>{title}</h1>
      <p>{text}</p>
      {link && (
        <p>
          <a href={link}>Go back to ShipThis</a>
        </p>
      )}
    </div>
  )
}

function ErrorText({error}: {error: string}) {
  if (!error) return null
  return (
    <p className="error" role="alert">
      {error}
    </p>
  )
}

function CancelButton({onCancel, disabled}: {onCancel: () => void; disabled: boolean}) {
  return (
    <button type="button" className="secondary" disabled={disabled} onClick={onCancel}>
      Cancel
    </button>
  )
}
