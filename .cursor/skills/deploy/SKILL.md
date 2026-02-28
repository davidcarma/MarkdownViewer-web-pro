---
name: deploy
description: Generic GitHub Pages deployment workflow. Use when the user says /deploy, asks to deploy, push to production, or publish changes.
---

# Deploy to GitHub Pages

Generic deployment workflow for static sites hosted on GitHub Pages.

## Pre-Deployment Checklist

### 1. Privacy scan (if available)

If the project has a privacy scan script, run it first:

```bash
# Check if privacy scan exists and run it
if [ -f scripts/privacy-scan.sh ]; then
  bash scripts/privacy-scan.sh
elif [ -f privacy-scan.sh ]; then
  bash privacy-scan.sh
fi
```

**For public repos**: Every commit is visible to everyone. Scan for:
- Personal paths (`/Users/...`, `C:\Users\...`)
- Personal emails and names
- API keys, tokens, secrets
- Hardcoded credentials

### 2. Check for absolute paths

```bash
# Search for common absolute path patterns (should return nothing)
grep -rn --include="*.js" --include="*.css" --include="*.html" \
  -E '/Users/|/home/|C:\\Users' . | grep -v node_modules | grep -v .git
```

### 3. Verify all paths are relative

```bash
# Check HTML for absolute URLs (external CDNs are OK, local paths should be relative)
grep -E 'src="|href="' index.html | grep -v 'http' | head -20
```

### 4. Run build script (if exists)

```bash
# Check for common build scripts and run
if [ -f build.sh ]; then
  bash build.sh
elif [ -f scripts/build.sh ]; then
  bash scripts/build.sh
fi
```

### 5. Pre-flight file check (if exists)

```bash
if [ -f check-deployment.sh ]; then
  bash check-deployment.sh
fi
```

## Deployment

### Standard deployment flow

```bash
# 1. Check status
git status

# 2. Stage all changes
git add -A

# 3. Commit with descriptive message
git commit -m "Deploy: <brief summary of changes>"

# 4. Push to main (or master)
git push origin main
```

GitHub Pages auto-deploys from the configured branch (usually `main` or `gh-pages`).

### Verify deployment

Wait 1–3 minutes for GitHub Pages to rebuild, then:

1. Check the repository's **Actions** tab for build status
2. Hard-refresh the site (`Cmd+Shift+R` / `Ctrl+Shift+R`)
3. Verify key files load correctly

## Rollback

If something goes wrong:

```bash
# View recent commits
git log --oneline -10

# Option 1: Revert the last commit (creates new commit)
git revert HEAD
git push origin main

# Option 2: Reset to specific commit (destructive - use with caution)
git reset --hard <commit-hash>
git push origin main --force  # DANGER: rewrites history
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Site not updating | Wait 3 min, hard-refresh. Check Actions tab for build status. |
| 404 on files | `git ls-files <path>` to verify file is tracked. Check case sensitivity. |
| Mixed content warnings | Ensure no `http://` refs for local assets — use relative paths. |
| Custom domain gone | Check that `CNAME` file exists and is committed. |
| Assets not loading | Verify paths are relative, not absolute. Check browser DevTools Network tab. |

## GitHub Pages Settings

To configure GitHub Pages for a repository:

1. Go to repository **Settings** → **Pages**
2. Under **Source**, select the branch (`main` or `gh-pages`)
3. Select folder (`/` for root or `/docs`)
4. Save and wait for first deployment

For custom domains:
1. Add a `CNAME` file with your domain name
2. Configure DNS with your domain provider
3. Enable "Enforce HTTPS" in Pages settings
