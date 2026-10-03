// The logo, the page around each step, and the footer with the commit.

import type {ReactNode} from 'react'

import logoDark from './logo-dark.svg'
import logoLight from './logo-light.svg'

export const REPO_URL = 'https://github.com/shipth-is/connect'
export const COMMIT = import.meta.env.VITE_COMMIT ?? ''

// Links to a file at the exact commit this page was built from
export const sourceUrl = (path: string) => `${REPO_URL}/blob/${COMMIT || 'main'}/${path}`

export function Layout({children}: {children: ReactNode}) {
  return (
    <>
      <header>
        <picture>
          <source srcSet={logoDark} media="(prefers-color-scheme: dark)" />
          <img src={logoLight} alt="ShipThis" width={176} height={51} />
        </picture>
      </header>
      <main>{children}</main>
      <Footer />
    </>
  )
}

function Footer() {
  return (
    <footer>
      {COMMIT ? (
        <a href={`${REPO_URL}/tree/${COMMIT}`}>Build {COMMIT.slice(0, 7)}</a>
      ) : (
        <span>dev build</span>
      )}
      {' · '}
      <a href={`${REPO_URL}#how-to-check-this-page`}>How to check this page</a>
    </footer>
  )
}

export function Notice() {
  return (
    <div className="notice">
      <p>
        Your Apple password stays in this page. The page sends only{' '}
        <a href={sourceUrl('docs/how-it-works.md')}>SRP proof values</a> to the ShipThis API, and the ShipThis API
        sends them to Apple.
      </p>
      <p>
        The ShipThis API uses your Apple session to set up your app. It deletes the session when the setup ends,
        or after 30 minutes if you do not use it.
      </p>
      <p>
        <a href={sourceUrl('src/srp.ts')}>Read the code that handles your password</a>
      </p>
    </div>
  )
}
