// Step 1: Apple ID and password

import * as api from '../api'
import {h} from '../dom'
import * as srp from '../srp'
import {cancelButton, errorBox, type Handlers, run, showErrorIn} from '../ui'

interface Props extends Handlers {
  error?: string
  onSignedIn: (response: api.SignInResponse) => void
  onCancel: () => void
}

export function signInView(props: Props) {
  const box = errorBox()
  const accountName = h('input', {
    id: 'apple-id',
    type: 'email',
    name: 'username',
    autocomplete: 'username',
    required: true,
    maxlength: 254,
  })
  const password = h('input', {
    id: 'password',
    type: 'password',
    name: 'password',
    autocomplete: 'current-password',
    required: true,
  })

  const form = h(
    'form',
    {class: 'step'},
    h('h1', {}, 'Sign in to Apple'),
    h('div', {id: 'notice'}),
    box,
    h('label', {for: 'apple-id'}, 'Apple ID'),
    accountName,
    h('label', {for: 'password'}, 'Password'),
    password,
    h('div', {class: 'buttons'}, h('button', {type: 'submit'}, 'Sign in'), cancelButton(props.onCancel)),
  )

  if (props.error) showErrorIn(box, props.error)

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    if (form.hasAttribute('aria-busy')) return
    run(form, box, props, async () => {
      const client = await srp.init(accountName.value)
      const challenge = await api.signinInit({
        accountName: client.accountName,
        a: client.a,
        protocols: client.protocols,
      })
      let proof: srp.SrpProof
      try {
        proof = await client.proof(password.value, challenge)
      } finally {
        // The password is not needed after the proof, whatever happened
        password.value = ''
      }
      // Never retried - Apple locks accounts
      props.onSignedIn(await api.signinComplete(proof))
    })
  })

  return form
}
