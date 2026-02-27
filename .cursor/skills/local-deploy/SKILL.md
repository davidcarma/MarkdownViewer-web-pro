---
name: local-deploy
description: Serve MarkdownViewer-web-pro locally for testing. Use when the user says /localdeploy, asks to test locally, run a local server, or preview before pushing.
---

# Local Deploy

Serve the app locally to verify changes before pushing to the **public** repo.

## Steps

### 1. Privacy scan (MANDATORY — public repo)

```bash
bash scripts/privacy-scan.sh
```

**Do NOT proceed if this fails.** Fix every violation first — any personal info (paths, emails, names) will be publicly visible.

### 2. Pre-flight file check

```bash
bash check-deployment.sh
```

Confirms vendored libs (`lib/`), app files (`js/`, `css/`), and KaTeX fonts are all present.

### 3. Start local server

```bash
# Python (zero-install)
python3 -m http.server 8080

# Or Node
npx serve -l 8080
```

Open: **http://localhost:8080**

## What to Verify

1. **Console clean** — no 404s or JS errors in DevTools
2. **Markdown rendering** — type markdown, confirm preview renders
3. **Math** — paste `$E=mc^2$` and `$$\int_0^1 x\,dx$$`
4. **Mermaid** — paste a mermaid code block, verify render + zoom/pan + copy-image
5. **Themes** — cycle Light / Dark / Gwyneth
6. **Minimaps** — visible on editor and preview, toggle buttons work
7. **View persistence** — switch to preview-only, reload, confirm mode remembered
8. **File ops** — open, save, drag-drop a `.md` file
9. **Image paste** — paste image from clipboard, verify embed

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Port in use | `python3 -m http.server 8081` |
| KaTeX fonts 404 | Check `lib/fonts/` has 20 `.woff2` files |
| Mermaid not rendering | Check `lib/mermaid.min.js` loads (Network tab) |
| `file://` protocol issues | Always use HTTP server; `file://` breaks clipboard/CORS |
