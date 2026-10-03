// Step 2: two-factor. A code from a trusted device, or by SMS.

import * as api from '../api'
import {h} from '../dom'
import {cancelButton, errorBox, type Handlers, onClick, run} from '../ui'

interface Props extends Handlers {
  twoFactor: api.TwoFactorResponse
  onVerified: (response: api.SessionResponse) => void
  onCancel: () => void
}

function firstTarget(twoFactor: api.TwoFactorResponse): api.VerifyTarget | null {
  // Apple has already sent an SMS - don't send another one
  if (twoFactor.smsSentTo !== undefined) return {method: 'phone', phoneId: twoFactor.smsSentTo}
  if (twoFactor.trustedDevices) return {method: 'device'}
  return null
}

export function twoFactorView(props: Props) {
  const root = h('div', {class: 'step'})
  const {phones, codeLength} = props.twoFactor

  const show = (target: api.VerifyTarget | null) => {
    root.replaceChildren(target ? codeForm(target) : phoneList())
  }

  // Pick a phone, then we send it a code
  const phoneList = () => {
    const box = errorBox()
    const list = h('div', {class: 'phones'})
    for (const phone of phones) {
      list.append(
        onClick(h('button', {type: 'button', class: 'phone'}, phone.number), () =>
          run(root, box, props, () => api.sendSms(phone.id)).then((sent) => {
            if (sent) show({method: 'phone', phoneId: phone.id})
          }),
        ),
      )
    }
    return h(
      'div',
      {},
      h('h1', {}, 'Two-factor authentication'),
      h('p', {}, 'Select a phone to get a code.'),
      box,
      list,
      h('div', {class: 'buttons'}, cancelButton(props.onCancel)),
    )
  }

  const codeForm = (target: api.VerifyTarget) => {
    const box = errorBox()
    const code = h('input', {
      id: 'code',
      name: 'code',
      inputmode: 'numeric',
      autocomplete: 'one-time-code',
      maxlength: codeLength,
      required: true,
    })
    code.addEventListener('input', () => {
      code.value = code.value.replace(/\D/g, '')
    })

    const phone = target.method === 'phone' ? phones.find((p) => p.id === target.phoneId) : undefined
    const text =
      target.method === 'device'
        ? 'Enter the code that shows on your Apple device.'
        : `We sent a code to ${phone?.number ?? 'your phone'}.`

    const links = h('p', {class: 'links'})
    if (target.method === 'device' && phones.length > 0) {
      links.append(onClick(h('a', {href: '#'}, 'Text me instead'), () => show(null)))
    }
    if (target.method === 'phone') {
      links.append(onClick(h('a', {href: '#'}, 'Resend code'), () => run(form, box, props, () => api.sendSms(target.phoneId))))
    }

    const form = h(
      'form',
      {},
      h('h1', {}, 'Two-factor authentication'),
      h('p', {}, text),
      box,
      h('label', {for: 'code'}, 'Code'),
      code,
      links,
      h('div', {class: 'buttons'}, h('button', {type: 'submit'}, 'Verify'), cancelButton(props.onCancel)),
    )

    form.addEventListener('submit', (e) => {
      e.preventDefault()
      if (form.hasAttribute('aria-busy') || !code.value) return
      run(form, box, props, async () => {
        props.onVerified(await api.verifyCode(code.value, target))
      })
    })

    queueMicrotask(() => code.focus())
    return form
  }

  show(firstTarget(props.twoFactor))
  return root
}
