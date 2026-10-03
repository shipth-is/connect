// A tiny helper to build elements. Text always goes in as text, never as HTML.

type Attrs = Record<string, string | number | boolean | undefined>
type Child = Node | string | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue
    el.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    el.append(child)
  }
  return el
}

// Turns the buttons and inputs in a form on or off while a call runs
export function setBusy(root: HTMLElement, busy: boolean) {
  for (const el of root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) {
    el.disabled = busy
  }
  root.toggleAttribute('aria-busy', busy)
}
