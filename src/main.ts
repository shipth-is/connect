// The page: read the link, swap the token, sign in, two-factor, go back.
// See docs/PLAN.md section 4.

import * as api from './api'
import {getConfig} from './config'
import {getReturnPath, getReturnUrl} from './returnPath'
import type {Handlers} from './ui'
import {messageView} from './views/message'
import {signInView} from './views/signin'
import {twoFactorView} from './views/twoFactor'

// `navigate` is only swapped out by the tests
export function start(app: HTMLElement, navigate = (url: string) => location.replace(url)) {
  const show = (el: HTMLElement) => app.replaceChildren(el)

  const config = getConfig(location.hostname)
  if (!config) {
    show(messageView('Something is wrong', 'This page is not configured for this address.'))
    return
  }
  api.setApiUrl(config.apiUrl)

  // Read the link, then take the token out of the address bar and history
  const params = new URLSearchParams(location.hash.slice(1))
  const token = params.get('token')
  const returnUrl = getReturnUrl(config.appOrigin, getReturnPath(params.get('return')))
  history.replaceState(null, '', location.pathname + location.search)

  const goBack = () => navigate(returnUrl)

  const showLinkExpired = () =>
    show(
      messageView('This link has expired', 'This link has expired. Go back to ShipThis and try again.', {
        href: returnUrl,
        label: 'Go back to ShipThis',
      }),
    )

  const cancel = async () => {
    // The server deletes it anyway after a while, so errors don't matter
    await api.deleteSession().catch(() => {})
    goBack()
  }

  const handlers: Handlers = {
    onSessionLost: (message) => showSignIn(message),
    onLinkExpired: showLinkExpired,
  }

  const onSignedIn = (response: api.SignInResponse) => {
    if (response.state === 'session') goBack()
    else show(twoFactorView({...handlers, twoFactor: response, onVerified: goBack, onCancel: cancel}))
  }

  const showSignIn = (error?: string) => show(signInView({...handlers, error, onSignedIn, onCancel: cancel}))

  if (!token) {
    showLinkExpired()
    return
  }

  show(messageView('Connecting', 'One moment…'))
  api.handoff(token).then(
    () => showSignIn(),
    (e) => {
      if (e instanceof api.ApiError && e.code === 'network') {
        show(messageView('Something is wrong', e.message, {href: returnUrl, label: 'Go back to ShipThis'}))
      } else showLinkExpired()
    },
  )
}

const app = document.getElementById('app')
if (app) start(app)
