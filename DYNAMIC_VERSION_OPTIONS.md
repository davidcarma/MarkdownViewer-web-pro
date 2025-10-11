# Dynamic Version Detection Options

## The Problem
Git commit hashes can't predict themselves - you can't embed a hash in a file that's part of the commit being hashed (circular dependency).

## Solutions Comparison

### Option 1: Pre-commit Hook (Current) ⭐ SIMPLE
**How it works:** Git hook updates build-info.js before commit
**Result:** Shows PREVIOUS commit hash (one behind)

```bash
# What you see
Build: dde8dd6  ← Shows hash of previous commit
Actual commit: a0ac94b
```

**Pros:**
- ✅ Simple, no complexity
- ✅ Works offline
- ✅ No API calls
- ✅ Fast

**Cons:**
- ❌ Always one commit behind

---

### Option 2: Post-commit Hook (Two Commits) ⭐ ACCURATE
**How it works:** Creates follow-up commit with correct hash
**Result:** Shows CORRECT hash but adds extra commit

```bash
Commit 1: "Fix bug" → hash abc1234 (your code)
Commit 2: "Update build-info" → hash xyz5678 (auto, contains abc1234)
```

**Pros:**
- ✅ Accurate tracking
- ✅ Works offline
- ✅ No API calls

**Cons:**
- ❌ Extra commits in history
- ❌ Git log gets cluttered

---

### Option 3: GitHub API (Runtime) ⭐ ALWAYS CURRENT
**How it works:** Fetch latest commit from GitHub when page loads
**Result:** ALWAYS shows current deployed hash

```javascript
// Fetch live from GitHub API
const response = await fetch(
  'https://api.github.com/repos/owner/repo/commits/main'
);
const data = await response.json();
buildInfo.hash = data.sha.substring(0, 7); // ALWAYS CURRENT!
```

**To enable:** In `index.html`, uncomment lines 535-536:
```javascript
const liveInfo = await fetchLiveCommitInfo();
if (liveInfo) buildInfo = liveInfo;
```

**Pros:**
- ✅ ALWAYS accurate
- ✅ Shows commit message
- ✅ No git hooks needed
- ✅ Clean git history
- ✅ No circular dependency

**Cons:**
- ❌ Requires network
- ❌ API rate limits (60/hour unauthenticated)
- ❌ Slower (network latency)
- ❌ Won't work offline

---

### Option 4: Hybrid (Best of Both) 🏆 RECOMMENDED
**How it works:** Use embedded hash as fallback, fetch live as primary

```javascript
// Embedded fallback (fast, offline)
let buildInfo = BUILD_INFO; // From build-info.js

// Try to get live data (accurate, online)
const liveInfo = await fetchLiveCommitInfo();
if (liveInfo) buildInfo = liveInfo; // Use live if available
```

**Pros:**
- ✅ Fast initial load (uses embedded)
- ✅ Upgrades to accurate when online
- ✅ Works offline (falls back)
- ✅ Best user experience

**Cons:**
- ⚠️ Slightly more complex

---

## How to Enable GitHub API (Option 3/4)

### 1. Edit `index.html` line 535-536:

**Current (embedded only):**
```javascript
// Option to fetch live data (uncomment to enable)
// const liveInfo = await fetchLiveCommitInfo();
// if (liveInfo) buildInfo = liveInfo;
```

**Enable live fetching:**
```javascript
// Fetch live data from GitHub
const liveInfo = await fetchLiveCommitInfo();
if (liveInfo) buildInfo = liveInfo;
```

### 2. Verify GitHub repo info (lines 498-502):
```javascript
const GITHUB_REPO = {
    owner: 'davidcarma',
    repo: 'MarkdownViewer-web-pro',
    branch: 'main'
};
```

### 3. Test it:
```bash
# Open in browser
open http://localhost:8001

# Check console - you should see:
⚡🏗️ Markdown Pro - Build: a0ac94b on 2025-10-11...
📝 Latest commit: "Fix: Preserve <br/> tags in Mermaid diagrams"
```

---

## API Response Details

### What you get from GitHub API:
```json
{
  "sha": "a0ac94b79a0915d7155e6ad7eb0cf36d39f8564e",
  "commit": {
    "author": {
      "name": "David Carma",
      "date": "2025-10-11T05:52:10Z"
    },
    "message": "Fix: Preserve <br/> tags in Mermaid diagrams\n\n- Extract mermaid code blocks..."
  }
}
```

### What gets displayed:
- **Hash:** `a0ac94b` (short form)
- **Date:** Local timezone formatted
- **Message:** First line of commit message
- **Tooltip:** Shows it's "⚡ Live from GitHub"

---

## Rate Limits

### GitHub API limits:
- **Unauthenticated:** 60 requests per hour per IP
- **With token:** 5,000 requests per hour

### How often does it fetch?
- **Once per page load**
- **Not on every refresh** (browser may cache)

### Is 60/hour enough?
For a personal project: **YES** ✅
- Even with 60 refreshes/hour, you're fine
- Most users won't refresh that much
- Multiple users share same endpoint (cached by GitHub)

---

## Recommendation

### For your use case (Markdown Pro):
**Use Hybrid Approach (Option 4)**

Why?
1. ✅ Page loads fast (embedded fallback)
2. ✅ Upgrades to accurate hash when online
3. ✅ Works offline during dev
4. ✅ Users always see current version
5. ✅ Shows commit message (nice touch!)

### To enable:
Just uncomment 2 lines in `index.html` (lines 535-536)

---

## Testing

### Test embedded version:
```bash
# Disconnect from internet
# Open http://localhost:8001
# Should still show build hash from build-info.js
```

### Test live version:
```bash
# Enable live fetch in index.html
# Open http://localhost:8001
# Console should show: ⚡🏗️ Markdown Pro
# Hover over build badge - tooltip shows "⚡ Live from GitHub"
```

---

## Summary Table

| Feature | Pre-commit | Post-commit | GitHub API | Hybrid |
|---------|-----------|-------------|------------|--------|
| **Accuracy** | One behind | Accurate | Perfect | Perfect |
| **Offline** | ✅ | ✅ | ❌ | ✅ |
| **Speed** | ⚡ Fast | ⚡ Fast | 🐌 Slow | ⚡/🐌 Mixed |
| **Git history** | Clean | Cluttered | Clean | Clean |
| **Complexity** | Simple | Medium | Simple | Medium |
| **Recommended** | Dev | Production | Public | Best |

---

## Current Setup

✅ **Embedded** version is already working (build-info.js)  
⏸️ **Live API** fetch is available but commented out  
🔧 **To enable live:** Uncomment lines 535-536 in index.html


