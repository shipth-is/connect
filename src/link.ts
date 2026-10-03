// The link the ShipThis app opens: #token=<handoff token>&return=<path>

import {getReturnPath, getReturnUrl} from './returnPath'

export function readLink(appOrigin: string) {
  const params = new URLSearchParams(location.hash.slice(1))
  // Take the token out of the address bar and the history straight away
  history.replaceState(null, '', location.pathname + location.search)
  return {
    token: params.get('token'),
    returnUrl: getReturnUrl(appOrigin, getReturnPath(params.get('return'))),
  }
}
