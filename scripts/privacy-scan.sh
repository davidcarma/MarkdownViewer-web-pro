#!/bin/bash
#
# Privacy scan for a PUBLIC repository.
# Run before every commit/push to ensure no personal information leaks.
# Exit code 0 = clean, 1 = violations found.

echo "==================================="
echo "Privacy Scan (Public Repo)"
echo "==================================="
echo ""

violations=0

# ── 1. Scan all tracked files for personal identifiers ──────────────────────

echo "🔍 Scanning tracked files for private info..."

# Generic patterns that catch private info without containing any.
# Add project-specific patterns to .privacy-patterns (one regex per line, gitignored).
PATTERNS=(
  '/Users/[a-zA-Z]'           # macOS home directory paths
  '/home/[a-zA-Z]'            # Linux home directory paths
  'C:\\Users\\'               # Windows home directory paths
  '@gmail\.com'               # Personal email
  '@yahoo\.com'               # Personal email
  '@hotmail\.com'             # Personal email
  '@outlook\.com'             # Personal email
  '@icloud\.com'              # Personal email
)

# Load extra patterns from local file (gitignored — never committed)
if [ -f .privacy-patterns ]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    PATTERNS+=("$line")
  done < .privacy-patterns
fi

# Build a single combined regex
combined=""
for p in "${PATTERNS[@]}"; do
  if [ -z "$combined" ]; then
    combined="$p"
  else
    combined="$combined|$p"
  fi
done

# Search tracked files only (skip .git, binary files, this script itself)
hits=$(git ls-files -z | xargs -0 grep -rInE "$combined" \
  --include='*.js' --include='*.html' --include='*.css' \
  --include='*.md' --include='*.sh' --include='*.json' \
  --include='*.txt' --include='*.pl' --include='*.yml' --include='*.yaml' \
  2>/dev/null | grep -v 'privacy-scan.sh' | grep -v 'SKILL.md')

if [ -n "$hits" ]; then
  echo "  ❌ Private info found in file content:"
  echo "$hits" | while IFS= read -r line; do echo "     $line"; done
  violations=1
else
  echo "  ✅ No private info in tracked file content"
fi

# ── 2. Check git author/committer metadata ──────────────────────────────────

echo ""
echo "🔍 Checking git commit metadata..."

bad_emails=$(git log --all --format='%ae%n%ce' | sort -u | grep -ivE 'noreply@github\.com|users\.noreply\.github\.com')

if [ -n "$bad_emails" ]; then
  echo "  ❌ Non-noreply emails found in commit history:"
  echo "$bad_emails" | while IFS= read -r e; do echo "     $e"; done
  echo ""
  echo "     Fix: use git-filter-repo with a mailmap to rewrite history."
  violations=1
else
  echo "  ✅ All commit emails use GitHub noreply addresses"
fi

bad_names=$(git log --all --format='%an%n%cn' | sort -u | grep -ivE '^davidcarma$|^GitHub$')

if [ -n "$bad_names" ]; then
  echo "  ⚠️  Non-standard author names in commits: $bad_names"
  echo "     (Check these are acceptable for a public repo)"
else
  echo "  ✅ All commit author names look clean"
fi

# ── 3. Check staged changes (if any) ────────────────────────────────────────

echo ""
echo "🔍 Checking staged changes..."

staged=$(git diff --cached --name-only 2>/dev/null)
if [ -n "$staged" ]; then
  staged_hits=$(git diff --cached | grep -InE "$combined" | grep '^+' | grep -v 'privacy-scan.sh' | grep -v 'SKILL.md')
  if [ -n "$staged_hits" ]; then
    echo "  ❌ Private info in staged diff:"
    echo "$staged_hits" | while IFS= read -r line; do echo "     $line"; done
    violations=1
  else
    echo "  ✅ Staged changes are clean"
  fi
else
  echo "  ✅ No staged changes to scan"
fi

# ── 4. Check for secrets / keys ─────────────────────────────────────────────

echo ""
echo "🔍 Checking for potential secrets..."

secret_patterns='(api[_-]?key|secret[_-]?key|password|token|private[_-]?key|AWS_|GITHUB_TOKEN)[[:space:]]*[=:]'

secret_hits=$(git ls-files -z | xargs -0 grep -rInE "$secret_patterns" \
  --include='*.js' --include='*.html' --include='*.json' --include='*.sh' \
  --include='*.env' --include='*.yml' --include='*.yaml' \
  2>/dev/null | grep -v 'privacy-scan.sh' | grep -v 'SKILL.md' | grep -v 'node_modules')

if [ -n "$secret_hits" ]; then
  echo "  ⚠️  Potential secrets found (review manually):"
  echo "$secret_hits" | while IFS= read -r line; do echo "     $line"; done
else
  echo "  ✅ No obvious secrets detected"
fi

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "==================================="
if [ $violations -eq 0 ]; then
  echo "✅ Privacy scan PASSED — safe to push to public repo"
else
  echo "❌ Privacy scan FAILED — fix issues above before pushing"
fi
echo "==================================="

exit $violations
