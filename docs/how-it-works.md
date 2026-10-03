# How the sign-in works

This page signs you in to Apple with **SRP** (Secure Remote Password). Apple's own sign-in pages use it too.
With SRP you prove that you know your password without ever sending it anywhere - not to Apple, and not to ShipThis.

## What goes where

Everything on the left happens in your browser, in [`src/srp.ts`](../src/srp.ts).

| Your browser | → ShipThis API → Apple | ← Apple ← ShipThis API |
|---|---|---|
| Picks a random secret number `a` and works out `A` from it | your Apple ID and `A` | |
| | | a salt, an iteration count and Apple's own number `B` |
| Hashes your password (SHA-256, then PBKDF2 with the salt), mixes it with `a` and `B`, and makes two proofs, `M1` and `M2` | `M1` and `M2` | |
| | | yes or no, and two-factor if you have it on |

Apple keeps a "verifier" made from your password when you set it. It can check `M1` against that without knowing your password.

So the **SRP proof values** are `A`, `M1` and `M2`. `A` comes only from the random secret. `M1` and `M2` are made from your password plus secrets which are used once. Someone who only sees them can't get your password back (but see Limits below).

The ShipThis API sits in the middle because your browser can't talk to Apple's sign-in service directly. It passes the values on and keeps the Apple session at the end - see below.

## What ShipThis gets

At the end Apple gives a **session** (cookies), like when you sign in on the web. The ShipThis API keeps it, encrypted, for long enough to set up your app: the API key, certificate, bundle ID, App Store Connect app and profile. Then it deletes it. If you don't use it, it's gone after 30 minutes.

It does not keep Apple's "trust this browser" cookie, so the session can't be used to skip two-factor later.

## Limits - please read

We want to be straight about what this does and doesn't protect you from:

- **The session is real access.** While ShipThis holds it, it can do what you can do in App Store Connect. That's the point - it needs it to set up your app - but it's worth knowing.
- **SRP stops anyone in the middle from reading your password - but the middle could lie.** A dishonest server in the middle could send your browser its own `B` instead of Apple's. It could then take your `M1` and try to guess your password offline. A long, unique password makes that useless. This repo can't stop it, because the middle is the ShipThis API - you're trusting us not to do it, the same as with any service you sign in to.
- **You need to check you're running this code.** The footer shows the commit the page was built from, and the README shows you how to check that the page matches it.

## Read more

- [How Secure Remote Password protects your 1Password account](https://support.1password.com/secure-remote-password/) - 1Password use SRP too. Short and not too technical
- [Secure Remote Password protocol](https://en.wikipedia.org/wiki/Secure_Remote_Password_protocol) - Wikipedia
- [Developers: how we use SRP, and you can too](https://blog.1password.com/developers-how-we-use-srp-and-you-can-too/) - 1Password's longer write-up for developers
- [RFC 5054](https://www.rfc-editor.org/rfc/rfc5054) - the SRP standard. Apple uses its 2048-bit group with SHA-256
- [rclone#9209](https://github.com/rclone/rclone/pull/9209) - another open source project moving to the same Apple SRP sign-in, after Apple turned off the old one which sent the password
