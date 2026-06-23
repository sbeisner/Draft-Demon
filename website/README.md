# Lilith Forge website

Static marketing site for the studio and its first app.

- `index.html` — **Lilith Forge** studio home page → `lilithforge.com` (KAN-94)
- `inkubus/index.html` — **Inkubus** product landing page → `inkubus.lilithforge.com` (KAN-97)
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

DNS already lives in Cloudflare. The apex and the subdomain are two hostnames; the
simplest mapping is **two Pages projects from this one repo**, each with a different
output directory:

| Pages project | Build output dir | Custom domain |
|---|---|---|
| `lilith-forge-site` | `website` | `lilithforge.com`, `www.lilithforge.com` |
| `inkubus-site` | `website/inkubus` | `inkubus.lilithforge.com` |

For each: Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**,
pick this repo, set **Build command** = *(none)* and **Build output directory** as above,
then add the custom domain under the project's **Custom domains** tab (Cloudflare creates
the CNAME automatically). "Always Use HTTPS" is already on at the zone level (KAN-90).

> Alternative: one project serving `website/` with a Cloudflare redirect/route sending
> `inkubus.lilithforge.com` → `/inkubus/`. The two-project split above is cleaner.

## Hosting the DMG (important)

The current build, `release/Draft Demon-0.0.0-arm64.dmg`, is **~114 MB**. Cloudflare
Pages has a **25 MB per-file limit**, so the DMG **cannot** ship inside the Pages
deploy. Host it separately, then point the page at it:

1. Upload the `.dmg` to **Cloudflare R2** (or GitHub Releases / any static host).
   - In R2, create a bucket, upload the file, and either enable a public bucket URL
     or front it with a custom domain like `downloads.lilithforge.com`.
2. Edit `inkubus/index.html` → the `DOWNLOAD_URL` constant near the bottom:

   ```js
   var DOWNLOAD_URL = "https://downloads.lilithforge.com/Inkubus-latest-arm64.dmg";
   var DOWNLOAD_VERSION = "0.0.0";
   ```

`downloads/` is git-ignored so the binary never lands in the repo.

## Placeholders to wire up later

- **Subscribe form** (`#subscribe`) is UI-only — it validates and acknowledges but
  makes no network call. Wire it to Resend / a mailing list once email is set up (KAN-96).
- **Inkubus Pro** pricing and "Notify me at launch" are placeholders pending the
  billing/auth epic.
- The shipped artifact is still named **Draft Demon** internally (`productName` in
  `package.json`); the public product name is **Inkubus**. Rename when ready.
