# connect

The page at **connect.shipth.is** where you sign in to Apple, so [ShipThis](https://shipth.is) can set up iOS for your game.

Your Apple password stays in this page. The page proves to Apple that you know it, using SRP, and only sends the proof values on. This repo is all the code which runs on that page, so you can read it - and you can check the page you're using was built from it.

- [How the sign-in works](docs/how-it-works.md) - SRP in plain words, what ShipThis gets, and the limits
- [`src/srp.ts`](src/srp.ts) - the only file which touches your password
- [The plan](docs/PLAN.md) - how the page is built

## What happens

1. You click "Connect Apple account" in ShipThis. It opens this page with a single-use token.
2. You sign in to Apple here, and do two-factor if you have it on.
3. The page sends you back to ShipThis, which sets up your app with the Apple session and then deletes it.

The page loads nothing from other sites - no analytics, no fonts, no third-party scripts. Its Content Security Policy only lets it run its own code and talk to the ShipThis API.

## How to check this page

Each build of the page is a container image, built in public by [this repo's workflow](.github/workflows/build.yml) and pushed to `ghcr.io/shipth-is/connect`. GitHub signs a record (an attestation) of which workflow built it, and from which commit.

You need `docker`, `curl` and the [GitHub CLI](https://cli.github.com/) (`gh auth login`).

1. Look at the footer of the page. It says **Build abc1234** - that's the commit it was built from.
2. Clone this repo and run:

   ```bash
   scripts/verify.sh abc1234
   ```

It checks three things:

- the image for that commit has an attestation from this repo's `build.yml`, on `main`, for that exact commit
- the files in that image
- are byte for byte the same as the files `connect.shipth.is` serves you

You should see:

```
attested: built by .github/workflows/build.yml on main from <commit>
...
verified: all 9 files at https://connect.shipth.is match the image built from <commit>
```

To check just the attestation yourself:

```bash
gh attestation verify oci://ghcr.io/shipth-is/connect:sha-<full commit> --owner shipth-is --format json
```

(Without `--format json` it says nothing when it works - check the exit code is `0`.)

### What this doesn't prove

- It checks what the server sent **to the script**. A server could in theory send something else to your browser. If you want to be thorough, compare the files in your browser's dev tools (Network tab) with the ones in the image.
- It can't check the ShipThis API, which isn't public. See the limits in [how it works](docs/how-it-works.md#limits---please-read).

## Development

```bash
npm ci
npm test            # vitest
npm run typecheck
npm run dev         # http://localhost:5173 - talks to the ShipThis develop API
```

The page needs a handoff token from ShipThis in the URL (`#token=...`), so on its own it shows "This link has expired".

```bash
docker build --build-arg COMMIT=$(git rev-parse HEAD) -t connect .
scripts/test-image.sh connect
```

## Security

If you find a problem, please email support@shipth.is rather than opening an issue. See [SECURITY.md](SECURITY.md).

## License

MIT - see [LICENSE](LICENSE).
