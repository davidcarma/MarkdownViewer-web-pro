# Scratchpad

## Recent Session Notes

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
