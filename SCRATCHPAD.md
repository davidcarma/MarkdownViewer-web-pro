# Scratchpad

## Recent Session Notes

### 2026-09-23 (Drive uniqueness)
- Drive keys items by ID. Same visible name in one parent can exist many times.
- Old root cache skipped the name search, so extra `Markdown-pro` folders and same-name files kept appearing. The merge path parked extras in a wrapper folder instead of absorbing them.
- `createFolder` / `createFile` are now get-or-create. Same-parent duplicates merge into one ID. Nested folders that only share the name `Markdown-pro` are left alone.
- Rule: `.cursor/rules/drive-no-duplicate-names.mdc`. Test: `node test/drive-uniqueness.cjs`.

### 2026-09-23 (mermaid-fixes)
- Branch: `mermaid-fixes` (from main). Local only - no remote deploy yet.
- Vendored Mermaid **11.17.2** into `lib/mermaid.min.js`.
- Host: `useMaxWidth: false`, root `htmlLabels` + `markdownAutoWrap`; stop collapsing label `\n` to spaces.
- CSS: reset foreignObject / label `line-height: normal` so `.mermaid-inner { line-height: 0 }` does not clip text.
- Vertical fit: measure unscaled painted size, then fonts.ready second pass.
- Export path: `_normalizeMermaidSvgSize` after export render. README/SYSTEM no longer claim a fullscreen Mermaid modal.
- Fixture: `test/mermaid-identity-store.md`. Lesson: `docs/lessons/L-2026-09-23-mermaid-foreignobject-lineheight.md`.
- Local QA: identity + multiline OK; stress 12/0; suite 9/0; themes light/dark/gwyneth all render with toolbar.

### 2026-09-23
- Rewrote Finder to a two-pane path picker: Locations + list/breadcrumb. No Folders tree pane.
- Open vs Save chrome is split. Save has filename footer, destination label, Save here / Save to Disk.
- New Drive folder is an inline form, not `window.prompt`. `#finderNewFolder` is always in the markup and shown when Drive is selected.
- Drive stays in the Locations rail even when disconnected. Navigation is locked to Markdown-pro: no Google `root` listing, folder IDs only from list/breadcrumb, create/save use `resolveWorkingFolder`.

### 2026-09-01
- Preview Mermaid boxes now hug diagram height while still fitting the pane width.
- Cause: `parseFloat` on Mermaid's `width="100%"` plus a 120px min-height.
- Fix: `_normalizeMermaidSvgSize` in `js/core.js` uses viewBox/bbox; viewport height is scaled content + padding.
- Lesson: `docs/lessons/L-2026-09-01-mermaid-percent-width-height.md`

### 2026-05-06
- Fixed Mermaid "copy image" bug: edge curves appeared filled (dark wedge shapes) in the copied PNG.
- Root cause: `_deepInlineStyles` in `core.js` inlines `cssText` which bakes in the computed `fill` (resolved from color inheritance) onto SVG path elements. Mermaid's CSS class rules set `fill:none` on edges at runtime, but inlined `cssText` overrides that.
- Fix: after inlining `cssText`, check the SVG presentation attribute (`getAttribute('fill')`) and the computed fill value. Restore `fill:none` on path/line/polyline/polygon elements when the attribute says `none`, or when computed fill is none/transparent, or when the element has Mermaid edge class names.

---

## Google Auth Status

- Project: `green-entity-474807-r3` (`Google Markdown PRO`)
- App uses Google Drive with the non-sensitive scope `https://www.googleapis.com/auth/drive.file`
- OAuth web client is configured for:
  - JavaScript origin: `https://markdownpro.eyesondash.com`
  - Redirect URI: `https://markdownpro.eyesondash.com/`
- Branding Authorized domain is `eyesondash.com`
- Search Console ownership for `eyesondash.com` was verified for the current account during this session

## Important Findings

- The critical `Verify branding` action was hidden behind the tiny `Information and summary` icon on the Google Auth Platform `Branding` page
- The main Branding form can look complete while the real verification CTA is still hidden in that side panel
- `Verification Center` and `Branding` messages can appear contradictory because scope verification and brand verification are separate tracks
- `drive.file` does not require scope verification, but branding review can still be required for an external production app with branding

## Final State

- Branding verification was triggered successfully from the hidden side panel
- Production is now using only the replacement OAuth web client:
  - `1024951916599-iindkjk3tnmdffir4qm9ahe1hnfrlmi4.apps.googleusercontent.com`
- The older OAuth web client was deleted after confirming nobody else was using it
- The `Google hasn't verified this app` warning is no longer appearing
- Testing outcome:
  - A different Google account could sign in without seeing the warning
  - The warning persisted only on the owner account until old app access was revoked

## Root Cause And Resolution

- The app-wide OAuth configuration appears to have been correct for real users after the branding and client cleanup work
- The remaining warning was caused by stale OAuth consent or app grant state on the owner Google account, not by an active production misconfiguration
- Removing the existing app access from `myaccount.google.com/permissions` cleared the stale account-specific warning
- This means the previous alert was a per-account false positive tied to earlier test history

## GCP MCP Status

- Fixed:
  - `gcp_list_projects` now works
  - `gcp_get_project` now works
  - Cloud Resource Manager requests for the project now succeed
- Still limited:
  - OAuth / Google Auth Platform backend inspection is not fully available through the GCP MCP
  - Requests involving `clientauthconfig.googleapis.com` and `oauthconfig.googleapis.com` returned `PERMISSION_DENIED`
- Practical implication:
  - Use the GCP MCP for project and API state
  - Use browser inspection for hidden Google Auth Platform UI workflow steps

## Outcome

1. New users and other test accounts can sign in without the verification alert.
2. The owner account also signs in cleanly after revoking old app access.
3. Treat the OAuth warning incident as resolved.
4. If the warning ever reappears for only one account, first check and revoke that account's existing app access before changing production config.
