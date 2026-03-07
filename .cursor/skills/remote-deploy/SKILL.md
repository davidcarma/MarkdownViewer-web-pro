---
name: remote-deploy
description: Deploy MarkdownViewer-web-pro to production on GitHub Pages (markdownpro.eyesondash.com). Use when the user says /remotedeploy, asks to deploy, push to production, or publish changes.
---

# Remote Deploy

Deploy to **https://markdownpro.eyesondash.com** via GitHub Pages.

**This is a PUBLIC repository.** Every commit is visible to everyone. The privacy scan is non-negotiable.

## Deployment Steps

### 1. Privacy scan (MANDATORY — run FIRST)

```bash
bash scripts/privacy-scan.sh
```

This scans:
- All tracked files for personal paths (`/Users/...`), personal emails, names
- Git commit metadata for non-noreply email addresses
- Staged changes for newly introduced private info
- Potential secrets/API keys

**If it fails, stop.** Fix every violation before proceeding. Use `git-filter-repo` with a mailmap if commit metadata is dirty.

### 2. Pre-flight file check

```bash
bash check-deployment.sh
```

All items must show green.

### 3. Ensure git hooks are installed

```bash
bash scripts/install-git-hooks.sh
```

Installs the local `pre-push` hook from `githooks/pre-push`.

The hook automatically:
- captures the feature/deploy commit hash you actually want to verify
- regenerates `build-info.js` for that hash
- creates a second commit: `Build: update deployed hash <first-commit-hash>`

This keeps the UI showing the first pushed commit, not the follow-up stamp commit.

### 4. Commit and push

```bash
git add -A
git commit -m "Deploy: <brief summary of changes>"
git push origin main
```

Important:
- Do **not** run `bash build.sh` manually right before push unless you explicitly want an extra manual build-info commit.
- The working tree should be clean before `git push`, otherwise the `pre-push` hook will stop the push to avoid mixing unrelated files into the auto-generated stamp commit.
- Expect `git push` to create one extra local commit automatically when `build-info.js` needs updating.

GitHub Pages auto-deploys from `main` branch root.

### 5. Verify deployment

Wait 1–3 minutes, then:

```bash
for f in index.html lib/mermaid.min.js js/core.js css/editor.css lib/katex.min.css; do
  echo -n "$f → "
  curl -s -o /dev/null -w "%{http_code}" "https://markdownpro.eyesondash.com/$f"
  echo
done
```

Open **https://markdownpro.eyesondash.com** and hard-refresh (`Cmd+Shift+R`).

## Infrastructure

| Setting | Value |
|---------|-------|
| Hosting | GitHub Pages |
| Repo | `github.com/davidcarma/MarkdownViewer-web-pro` |
| Branch | `main` |
| Root | `/` (project root) |
| Domain | `markdownpro.eyesondash.com` (CNAME file) |
| SSL | Enforced by GitHub Pages |
| Build | Static — `pre-push` hook stamps `build-info.js` using `build.sh` |

## Rollback

```bash
git log --oneline -10    # find last known-good commit
git revert HEAD          # revert broken commit
git push origin main
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Site not updating | Wait 3 min, hard-refresh. Check Actions tab for build status. |
| Build hash looks stale | Confirm `scripts/install-git-hooks.sh` was run and that the `pre-push` hook created the extra `Build: update deployed hash ...` commit. |
| 404 on files | `git ls-files <path>` to verify tracked. Check case sensitivity. |
| Custom domain gone | Ensure `CNAME` contains `markdownpro.eyesondash.com` and is committed. |
| Mixed content | No `http://` refs allowed — all assets are vendored locally. |
| Privacy scan fails | Fix all violations. For commit metadata: `git-filter-repo --mailmap`. |
