# Lilith Forge website

Static marketing site for the studio and its first app.

- `index.html` — **Lilith Forge** studio home page → `lilithforge.com` (KAN-94)
- `inkubus/index.html` — **Inkubus** product landing page → `inkubus.lilithforge.com` (KAN-97)
- `cronus/index.html` — **Cronus** product landing page → `cronus.lilithforge.com` (pre-launch / waitlist; no download yet)
- `assets/` — shared brand artwork (mascot + logo)
- `downloads/` — local-only DMG for preview (git-ignored; see "Hosting the DMG" below)

No build step. Plain HTML/CSS with a touch of vanilla JS. Fonts load from Google Fonts; everything else is self-contained.

## Preview locally

```bash
cd website
python3 -m http.server 8080
# Studio home:  http://localhost:8080/
# Inkubus page: http://localhost:8080/inkubus/
```

The download button reads a local DMG at `downloads/Inkubus.dmg` for preview. The
cross-page links (nav "Get Inkubus", footer) point at the production
`https://inkubus.lilithforge.com` / `https://lilithforge.com` hostnames, so they
won't resolve in local preview — that's expected.

## Deploy (Cloudflare Pages — recommended, per KAN-89/KAN-94)

There's **no build step** — these are static folders, so deploy them directly with the
Wrangler CLI. The apex and the subdomain are two hostnames, so they're **two Pages
projects**. Each folder is self-contained (`inkubus/` has its own copy of `assets/`),
so each deploys cleanly on its own.

| Pages project | Folder to deploy | Custom domain |
|---|---|---|
| `lilith-forge-site` | `website` | `lilithforge.com`, `www.lilithforge.com` |
| `inkubus-site` | `website/inkubus` | `inkubus.lilithforge.com` |
| `cronus-site` | `website/cronus` | `cronus.lilithforge.com` |

> Depends on KAN-90 (DNS in Cloudflare) being done and a Cloudflare account existing.

### One-time setup

```bash
npm install -g wrangler   # or use npx wrangler ... below
wrangler login            # opens a browser to authorise your Cloudflare account
```

### Deploy commands (run from the repo root, "Draft Demon/")

```bash
# Apex / studio home  ->  lilithforge.com
wrangler pages deploy website --project-name=lilith-forge-site

# Inkubus product page  ->  inkubus.lilithforge.com
wrangler pages deploy website/inkubus --project-name=inkubus-site

# Cronus product page  ->  cronus.lilithforge.com
wrangler pages deploy website/cronus --project-name=cronus-site
```

The first run for a project name will offer to create the Pages project — accept it.
Re-running either command ships a new version. To deploy a non-production preview, add
`--branch=preview`.

### Attach the custom domains (once per project)

`wrangler pages` has **no `domain` subcommand** — add custom domains in the dashboard or
via the API.

Dashboard: **Workers & Pages → open the project → Custom domains → Set up a custom
domain**, then enter the hostname. Because DNS is already on Cloudflare (KAN-90),
Cloudflare creates the matching record and provisions the cert automatically.

- `lilith-forge-site`: add `lilithforge.com` and `www.lilithforge.com`
- `inkubus-site`: add `inkubus.lilithforge.com`
- `cronus-site`: add `cronus.lilithforge.com`

API alternative (token needs **Pages: Edit**):

```bash
ACCOUNT_ID=<your-account-id>
CF_TOKEN=<api-token-with-pages-edit>

add_domain() { # $1=project  $2=domain
  curl -sS -X POST \
    "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$1/domains" \
    -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
    --data "{\"name\":\"$2\"}" | jq '.success, .errors'
}

add_domain lilith-forge-site lilithforge.com
add_domain lilith-forge-site www.lilithforge.com
add_domain inkubus-site      inkubus.lilithforge.com
add_domain cronus-site       cronus.lilithforge.com
```

"Always Use HTTPS" is already on at the zone level (KAN-90).

> Single-project alternative: deploy just `website/` and route
> `inkubus.lilithforge.com` → `/inkubus/` with a Cloudflare rule. The two-project split
> above is simpler and is what the commands here assume.

## Hosting the DMG (important)

The current build, `release/Draft Demon-0.0.0-arm64.dmg`, is **~114 MB**. Cloudflare
Pages has a **25 MiB per-file limit**, so the DMG **cannot** ship inside the Pages
deploy. Two things keep it out and wire it up:

- **It's excluded from deploys** by `.assetsignore` (in both `website/` and
  `website/inkubus/`), which lists `downloads/` and `*.dmg`. Wrangler skips these on
  upload, so `wrangler pages deploy` won't trip the size limit even if a local DMG copy
  is sitting in `downloads/` for preview. (Requires Wrangler v3.50+. If yours is older,
  either upgrade or delete the `downloads/` folders before deploying.)
- **It's git-ignored** (`downloads/.gitignore`) so the binary never lands in the repo.

Host it and point the page at it:

1. Upload the `.dmg` to **Cloudflare R2** (or GitHub Releases / any static host).
   - In R2, create a bucket, upload the file, and either enable a public bucket URL
     or front it with a custom domain like `downloads.lilithforge.com`.
2. Edit `inkubus/index.html` → the `DOWNLOAD_URL` constant near the bottom (it already
   points at the `downloads.lilithforge.com` placeholder — set it to your real URL):

   ```js
   var DOWNLOAD_URL = "https://downloads.lilithforge.com/Inkubus-latest-arm64.dmg";
   var DOWNLOAD_VERSION = "0.0.0";
   ```

> For local preview only, temporarily set `DOWNLOAD_URL = "downloads/Inkubus.dmg"`.

## Placeholders to wire up later

- **Subscribe form** (`#subscribe`) is UI-only — it validates and acknowledges but
  makes no network call. Wire it to Resend / a mailing list once email is set up (KAN-96).
- **Inkubus Pro** pricing and "Notify me at launch" are placeholders pending the
  billing/auth epic.
- The shipped artifact is still named **Draft Demon** internally (`productName` in
  `package.json`); the public product name is **Inkubus**. Rename when ready.
