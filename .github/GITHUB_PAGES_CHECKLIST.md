# GitHub Pages — Checkliste nach dem ersten Push auf main

## Pflicht (App)

- [ ] **Settings → Pages** → Source: Branch **`gh-pages`**, Folder **`/ (root)`**
- [ ] Workflow **Deploy GitHub Pages** ist grün (Actions-Tab)
- [ ] App erreichbar: `https://<user>.github.io/<repo>/`

## Optional (LOX-Vault / Server-Speicher)

- [ ] Vault auf [Render](https://render.com) via `render.yaml` deployen (oder Docker auf eigenem Host)
- [ ] `T2_VAULT_CORS_ORIGINS` enthält `https://<user>.github.io`
- [ ] GitHub **Settings → Actions → Variables:**
  - `NEXT_PUBLIC_T2_VAULT_API_URL` = `https://…` (Vault-Host, ohne trailing slash)
- [ ] Workflow erneut laufen lassen (Push oder manuell)
- [ ] In der App: **Daten → Server (LOX-ID)** sichtbar

Details: [docs/GITHUB-PAGES.md](../docs/GITHUB-PAGES.md)
