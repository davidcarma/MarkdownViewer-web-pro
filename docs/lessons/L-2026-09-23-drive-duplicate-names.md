# L-2026-09-23-drive-duplicate-names

- **ID:** L-2026-09-23-drive-duplicate-names
- **Date:** 2026-09-23
- **Tags:** ui, auth, silent-failure, high, lesson
- **Severity:** high
- **Error class:** silent-failure
- **Rule (do not repeat):** Drive uniqueness is the file ID. Never `files.create` when the same name already exists in that parent. A stored Markdown-pro folder ID does not mean there is only one.

## Incident (example only)

The app cached the first `Markdown-pro` folder ID in localStorage and skipped the name search. `createFolder` / `createFile` always POSTed. New Folder and Save therefore spawned extra Drive items with the same visible name. The old "mitigation" moved extras into a `Markdown-pro 2` wrapper, which kept the duplicates.

## Root cause

`js/drive-storage.js` `ensureRootFolder` returned early on a valid stored ID. Create paths did not query `name + parent + trashed = false` before POST. Drive does not enforce unique names.

## Fix

Query-by-name get-or-create in `createFolder` / `createFile`. Reconcile same-parent `Markdown-pro` folders even when a root ID is cached. Merge extras into the canonical ID; do not wrap them.

## How to detect this in the future

`node test/drive-uniqueness.cjs`. In Drive, two items with the same name and the same parent after Save or New Folder is a regression.

## Related lessons

None.
