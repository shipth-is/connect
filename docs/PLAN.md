# Build plan: `shipth-is/connect`

A public repo for one small web page: `connect.shipth.is`. The page reads the user's Apple ID and password,
does Apple's SRP sign-in and 2FA through the ShipThis API, and sends the user back to ShipThis.
The password never leaves the page.

This plan covers only this repo. Section 3 documents the interfaces of the other parts. Do not build them here.

## Why this repo exists

ShipThis can set up iOS for a game from the browser. To do that, the user signs in to Apple once.
The ShipThis CLI already does this in the terminal, and its sign-in code is public.
We want the web sign-in to be just as easy to check.

So the page that reads the password is in this repo, and nothing else is. It loads no analytics and no third-party scripts.
A public workflow builds it, and each user can check that the page they see is the page that this repo built.

## 1. Requirements

- The page loads no third-party scripts. Its runtime dependencies are `@foxt/js-srp`, `react` and `react-dom`, pinned and bundled into the build.
- The page loads nothing from other origins. It calls only the ShipThis API.
- The page never logs, stores or sends the password, the SRP values (`a`, `m1`, `m2`) or the 2FA code,
  except in the API calls in section 3.2. Use no `console.*` calls on these values. Use no `localStorage`, `sessionStorage` or cookies.
- One container image serves both environments (develop and prod). Environment values come from the hostname
  (in the page) and from environment variables (in the server).
- A user can check that the deployed image is the image that the public build made (section 6).

## 2. Stack

| Item | Choice |
|---|---|
| Language | TypeScript and React. Most developers can read React, and the flow stays in one component (`src/App.tsx`). |
| Build | Vite. Set `build.modulePreload.polyfill: false`. Make sure that the output has no inline scripts and no inline styles. |
| Runtime dependencies | `@foxt/js-srp` `0.0.3-patch2` (ISC). Use its browser build. Make sure that the bundle has no `Buffer` or `crypto` polyfill. `react` and `react-dom` (MIT). |
| Tests | Vitest, React Testing Library and jsdom |
| Server | Caddy, in a Docker image |
| Package manager | npm. Pin exact versions. Commit `package-lock.json`. Use `npm ci`. |
| License | MIT, "Hello Invent LTD" |

## 3. Interfaces

### 3.1 Environments

The page selects its URLs from `window.location.hostname`:

| Page host | API base URL | App origin (return target) |
|---|---|---|
| `connect.shipth.is` | `https://api.shipth.is/api/1.0.0` | `https://shipth.is` |
| `connect.develop.shipth.is` | `https://api.develop.shipth.is/api/1.0.0` | `https://develop.shipth.is` |
| `localhost`, `127.0.0.1` | `https://api.develop.shipth.is/api/1.0.0` | `http://localhost:3000` (the ShipThis app in local development) |

For any other host, show the error "This page is not configured for this address." and do nothing else.

All API calls, except the handoff, send `Authorization: bearer <access token>` and `Content-Type: application/json`.

### 3.2 API endpoints

The relay endpoints exist on develop now. The two handoff endpoints are new. The backend builds them to this contract.

#### Handoff and tokens

The page has its own origin, so it cannot read the user's ShipThis login. Two short-lived tokens connect the page to the user.
Neither token is a JWT.

| | Handoff token | Access token |
|---|---|---|
| Made by | `POST /me/apple/handoff`. The main app calls it with the user's normal ShipThis login. | `POST /auth/apple-handoff`. The page calls it with the handoff token. |
| Format | 32 random bytes, base64url | `st-connect:<32 random bytes, base64url>` |
| Stored | A hash in Redis, with the user ID | A hash in Redis, with the user ID |
| Lifetime | Single use. Expires after 2 minutes. | Expires after 15 minutes |
| Where | The page URL fragment | `Authorization` header from the page |
| Accepted by | `POST /auth/apple-handoff` only | `/me/apple/*` only |

- The general `security` middleware does not accept an access token. It tries to read it as a JWT and returns `401`.
  Only a separate middleware on `/me/apple/*` accepts it. So a route that forgets to check gives `401`, not access.
- "Sign out everywhere" (`revokeUserJWTs`) also deletes the user's handoff and access tokens.
- The Apple session is stored with the user ID. The main app reads it later with its normal ShipThis login.

`POST /me/apple/handoff` is for the main app. The page does not call it:

| Endpoint | Body | Response |
|---|---|---|
| `POST /me/apple/handoff` (normal ShipThis login) | none | `200 {token}` |

#### Endpoints that the page calls

| Endpoint | Body | Response |
|---|---|---|
| `POST /auth/apple-handoff` (no `Authorization`) | `{token}` | `200 {accessToken, expiresAt}`. `401` if the token is wrong, used or expired. |
| `POST /me/apple/signin/init` | `{accountName, a, protocols: ['s2k','s2k_fo']}` | `200 {salt, iterations, b, protocol}` |
| `POST /me/apple/signin/complete` | `{m1, m2}` | `200` session response or two-factor response |
| `POST /me/apple/2fa/phone` | `{phoneId}` | `204`. Apple sends an SMS. |
| `POST /me/apple/2fa/verify` | `{code, method: 'device'}` or `{code, method: 'phone', phoneId}` | `200` session response |
| `DELETE /me/apple/session` | none | `204` |

Response shapes:

```ts
type SessionResponse = {
  state: 'session'
  teams: {providerId: number; name: string}[]
  current: {providerId: number | null; roles: string[]}
}

type TwoFactorResponse = {
  state: 'two-factor'
  phones: {id: number; number: string}[] // number is masked by Apple
  trustedDevices: boolean
  codeLength: number
  smsSentTo?: number // Apple already sent an SMS to this phone id
}
```

Field rules from the API: `accountName` is 1 to 254 characters. `code` is 4 to 8 digits. The base64 values `a`, `salt`, `b`, `m1` and `m2` are standard base64.

Errors:

- A relay error is `{error: <code>}` with an HTTP status.
- A body that fails validation gives `400` with an array of zod issues. Show "Something went wrong. Try again."
- A `401` with no `{error}` body means that the access token expired. Show the "link expired" error (section 4.5).
- If the request does not get to the API, show "Could not reach ShipThis. Check your connection and try again."

| Code | Message |
|---|---|
| `wrong_password` | The Apple ID or password is not correct. |
| `locked` | Apple has locked this account. Unlock it at iforgot.apple.com. |
| `apple_blocked` | Apple did not allow this sign-in. Try again later. |
| `privacy_ack` | Sign in once at appstoreconnect.apple.com to accept Apple's privacy notice. Then try again. |
| `too_many_codes` | Apple sent too many codes. Use the last code that you received, or wait and try again. |
| `security_key_only` | Your account uses only security keys for two-factor authentication. Add a trusted phone number, or use the ShipThis CLI. |
| `no_asc_access` | This Apple ID has no access to App Store Connect. |
| `wrong_code` | That code is not correct. Try again. |
| `rate_limited` | Too many attempts. Wait 15 minutes and try again. |
| `no_signin`, `session_expired`, `no_session` | Your Apple session has expired. Sign in again. Go back to the sign-in form. |
| `not_configured` | Apple sign-in is not available at the moment. Try again later. |
| `apple_error`, any other code | Apple returned an error. Try again later. |

Never retry `signin/complete` for the user. Apple locks accounts after failed attempts.

### 3.3 Page URL

The main app opens the page with this URL:

```
https://connect.shipth.is/#token=<handoff token>&return=<path>
```

- `token` is single-use. Read it, then remove the fragment at once with `history.replaceState`.
- `return` is a path on the app origin, for example `/games/<id>/setup/ios`.
  Accept it only if it starts with `/`, does not start with `//`, and has no `\` and no control characters. If it fails, use `/dashboard`.
- The page always returns the user to `<app origin><return>`. The main app reads the result from the API. The page adds no parameters.

### 3.4 Container

| Item | Value |
|---|---|
| Image | `ghcr.io/shipth-is/connect` |
| Tags | `sha-<full commit SHA>` and `main` |
| Port | `8080`, plain HTTP. App Platform does TLS. |
| Env `API_ORIGIN` | `https://api.shipth.is` or `https://api.develop.shipth.is`. Caddy uses it in the CSP. |

ShipThis runs the image as a DigitalOcean App Platform service and deploys it by digest. That config is not in this repo.

## 4. Page behavior

One HTML page with one React component, `App`. The component holds the current step and shows it.

### 4.1 Start

1. Read the environment (section 3.1).
2. Read `token` and `return` from the fragment, then remove the fragment.
3. If there is no token, show the "link expired" error.
4. Call `POST /auth/apple-handoff`. Keep the access token in a module variable only.
5. If the call fails, show the "link expired" error.
6. Show the sign-in form.

### 4.2 Sign-in form

- Fields: Apple ID (`type="email"`, `autocomplete="username"`) and password (`type="password"`, `autocomplete="current-password"`).
- Put the fields in a `<form>` with a real submit button. Enter must submit.
- Above the fields, show the notice in section 5.
- On submit:
  1. Run `srp.init(accountName)`.
  2. Call `signin/init`.
  3. Make the proof with the password.
  4. Clear the password field and the password variable. Do this in a `finally` block, also when the proof fails.
  5. Call `signin/complete`.
  6. For a session response, go to 4.4. For a two-factor response, go to 4.3.

### 4.3 Two-factor

- If `smsSentTo` is set, show the code form for that phone. Do not call `2fa/phone`.
- Else, if `trustedDevices` is true, show the code form for the device.
- Else, show the list of phones. When the user selects a phone, call `2fa/phone`, then show the code form for that phone.
- Code form: one field with `inputmode="numeric"`, `autocomplete="one-time-code"` and `maxlength` = `codeLength`.
  Remove non-digits as the user types.
- Device code form: show a "Text me instead" link if there are phones. It shows the list of phones.
- Phone code form: show a "Resend code" link. It calls `2fa/phone` again for the same phone.
- On submit, call `2fa/verify`. For a session response, go to 4.4.

### 4.4 Done

Go to `<app origin><return>` with `location.replace`.

### 4.5 Cancel and errors

- Each step after 4.1 has a "Cancel" button. It calls `DELETE /me/apple/session`, ignores errors, and goes to `<app origin><return>`.
- Show errors above the form. Keep the user on the same step, except for the session codes in section 3.2.
- "Link expired" error: "This link has expired. Go back to ShipThis and try again." Show a link to `<app origin><return>`.
- Disable the buttons while a call runs.

## 5. Text and footer

Notice above the sign-in form:

> Your Apple password stays in this page. The page sends only [SRP proof values](docs/how-it-works.md) to the ShipThis API, and the ShipThis API sends them to Apple.
> The ShipThis API uses your Apple session to set up your app. It deletes the session when the setup ends, or after 30 minutes if you do not use it.
> [Read the code that handles your password](https://github.com/shipth-is/connect/blob/<commit>/src/srp.ts).

Footer: "Build <first 7 characters of the commit>", linked to `https://github.com/shipth-is/connect/tree/<commit>`,
and a "How to check this page" link to the README section in section 6.

The commit comes from the build argument `COMMIT`. The Dockerfile gives it to Vite as `VITE_COMMIT`. A build with no commit shows "dev build".

Style: one CSS file. System font stack. The ShipThis logo as two SVG files in the repo, one for light mode and one for dark mode.
Support dark mode with `prefers-color-scheme`. Use no web fonts and no Apple logo.

## 6. Build, image and verification

### 6.1 Dockerfile

1. Stage 1: `node:24-alpine`, pinned by digest. `npm ci`, then `vite build` with `VITE_COMMIT` set from the `COMMIT` build argument.
2. Stage 2: `caddy:2-alpine`, pinned by digest. Copy `dist/` and `Caddyfile`. Expose `8080`.

### 6.2 Caddyfile

Listen on `:8080` with no automatic HTTPS. Serve `dist/`. Send these headers on all responses:

```
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src {$API_ORIGIN}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

Cache: `index.html` gets `Cache-Control: no-store`. Files in `assets/` get `Cache-Control: public, max-age=31536000, immutable`.
`docker-entrypoint.sh` refuses to start Caddy unless `API_ORIGIN` is a plain `https://` origin. Caddy runs as `nobody`, with the admin API off.

`scripts/test-image.sh <image>` runs the image and checks the headers, the cache rules and the `API_ORIGIN` check. CI runs it on each PR.

### 6.3 GitHub Actions

Workflow `.github/workflows/build.yml`, with three jobs:

| Job | Runs on | Does |
|---|---|---|
| `test` | each PR and each push to `main` | `npm ci`, type check, `vitest run`, `vite build` |
| `image` | each PR and each push to `main` | builds the image and runs `scripts/test-image.sh` on it |
| `publish` | a push to `main` only, after `test` and `image` pass | builds and pushes the image, then attests it |

The `publish` job:

1. Builds and pushes one `linux/amd64` image with `docker/build-push-action`, with `COMMIT=${{ github.sha }}`.
   Use the tags in section 3.4. Add the labels `org.opencontainers.image.source` and `org.opencontainers.image.revision`.
   Set `provenance: false` and `sbom: false`, so the digest is one plain image. The next step makes the provenance.
2. Runs `actions/attest-build-provenance` with the image digest and `push-to-registry: true`.
3. Pulls the image by digest and runs `scripts/test-image.sh` on it again.
4. Writes the digest and the `gh attestation verify` command to the job summary.

Only the `publish` job has these permissions: `packages: write`, `id-token: write`, `attestations: write`.
All the other jobs have `contents: read` only. A PR, also from a fork, never pushes anything.
Pin all actions by commit SHA.

One manual step after the first push: make the GHCR package public.

### 6.4 README: "How to check this page"

Write the steps that a user follows:

1. Read the commit in the page footer.
2. Run `gh attestation verify oci://ghcr.io/shipth-is/connect:sha-<commit> --owner shipth-is`.
3. Run `scripts/verify.sh <commit>`. It pulls the image, copies `dist/` out of it, downloads the same files from
   `https://connect.shipth.is`, and compares the SHA-256 of each file.

Write `scripts/verify.sh` (bash, needs `docker` and `curl`).

## 7. Repo layout

```
src/
  main.tsx         reads the config and the link, then shows App
  App.tsx          the steps: sign in, two-factor, cancel, errors
  Layout.tsx       the logo, the notice and the footer
  link.ts          reads the page URL and removes the fragment
  srp.ts           Apple SRP. The only file that reads the password. ShipThis has this code in its private app now. Move it here.
  api.ts           the calls in section 3.2, and the error-code messages
  config.ts        the environment table in section 3.1
  returnPath.ts    the return-path check in section 3.3
  style.css
  logo-light.svg, logo-dark.svg
test/
  srp.test.ts
  config.test.ts
  returnPath.test.ts
  api.test.ts
  link.test.ts
  App.test.tsx
  Layout.test.tsx
index.html
Dockerfile
Caddyfile
scripts/make-vector.mjs
scripts/test-image.sh
scripts/verify.sh
.github/workflows/build.yml
docs/how-it-works.md  SRP in plain words, what ShipThis gets, the limits, links to read more
README.md         what the page does, where the password goes, how to check the page
SECURITY.md       how to report a problem: support@shipth.is
LICENSE
```

## 8. Tests

- `srp.test.ts`: a fixed vector in `test/srp-vector.json`. `scripts/make-vector.mjs` makes it. The script uses the Node build
  of `@foxt/js-srp` and Node's `crypto`, with a fixed account name, password, `a`, salt, iterations and `b`, for both `s2k` and `s2k_fo`.
  It is a separate copy of the maths, so it checks `srp.ts`. `srp.init` (with the optional fixed `a`) and `proof` must give
  the same `a`, `m1` and `m2`. Do not use a real password.
- `returnPath.test.ts`: accepts `/games/x/setup/ios`. Rejects `//evil.com`, `https://evil.com`, `/\evil.com`, an empty value and a missing value.
- Manual, on develop: the full flow with SMS 2FA and with device 2FA, a wrong password once (no retry), cancel, and an expired link.
  Use the browser's network panel to make sure that no request goes to a host other than the API.

## 9. Not in this repo

- The two handoff endpoints, the tokens and the `/me/apple/*` middleware (backend).
- The "Connect Apple account" button and the return handling (frontend).
- The App Platform config and the DNS record.
- Team selection and the setup job. The main app does these after the return.
