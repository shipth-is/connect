// A screen with a message and maybe a link - errors, and "please wait"

import {h} from '../dom'

export function messageView(title: string, text: string, link?: {href: string; label: string}) {
  return h(
    'div',
    {class: 'step'},
    h('h1', {}, title),
    h('p', {}, text),
    link && h('p', {}, h('a', {href: link.href}, link.label)),
  )
}
