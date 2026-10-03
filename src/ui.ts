// Shared bits for the steps: the error box, running a call, cancel.

import {ApiError} from './api'
import {h, setBusy} from './dom'

export interface Handlers {
  // The Apple session has gone - start again from the sign in form
  onSessionLost: (message: string) => void
  // The JWT has gone - nothing else will work
  onLinkExpired: () => void
}

export const errorBox = () => h('p', {class: 'error', role: 'alert', hidden: true})

export function showErrorIn(box: HTMLElement, message: string) {
  box.textContent = message
  box.hidden = !message
}

// Runs one API call for a step. Turns the form off while it runs and shows
// any error. Returns true when the call worked.
export async function run(root: HTMLElement, box: HTMLElement, handlers: Handlers, fn: () => Promise<void>) {
  setBusy(root, true)
  showErrorIn(box, '')
  try {
    await fn()
    return true
  } catch (e) {
    if (e instanceof ApiError && e.isLinkExpired) handlers.onLinkExpired()
    else if (e instanceof ApiError && e.isSessionError) handlers.onSessionLost(e.message)
    else showErrorIn(box, e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
    return false
  } finally {
    if (root.isConnected) setBusy(root, false)
  }
}

export const cancelButton = (onCancel: () => void) =>
  onClick(h('button', {type: 'button', class: 'secondary'}, 'Cancel'), onCancel)

export function onClick(el: HTMLElement, fn: () => void) {
  el.addEventListener('click', (e) => {
    e.preventDefault()
    fn()
  })
  return el
}
