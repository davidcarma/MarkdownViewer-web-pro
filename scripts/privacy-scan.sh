#!/bin/bash
#
# Privacy scan for a PUBLIC repository.
# Run before every commit/push to ensure no personal information leaks.
# Exit code 0 = clean, 1 = violations found.

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║       PRIVACY SCAN (Public Repo)      ║"
echo "╚═══════════════════════════════════════╝"
echo ""

violations=0

# ── 1. Scan tracked files for personal identifiers ──────────────────────────

echo "▶ [1/4] Scanning tracked files..."

# Generic patterns (no personal info in the script itself)
PATTERNS=(
  '/Users/[a-zA-Z]'           # macOS home paths
  '/home/[a-zA-Z]'            # Linux home paths
  'C:\\Users\\'               # Windows home paths
  '@gmail\.com'
  '@yahoo\.com'
  '@hotmail\.com'
  '@outlook\.com'
  '@icloud\.com'
)

# Load extra patterns from .privacy-patterns (gitignored)
if [ -f .privacy-patterns ]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    PATTERNS+=("$line")
  done < .privacy-patterns
fi

# Build combined regex
combined=""
for p in "${PATTERNS[@]}"; do
  combined="${combined:+$combined|}$p"
done

# Exclude files that legitimately mention patterns
EXCLUDE_FILES="privacy-scan.sh|SKILL.md|\.privacy-patterns"

# Search and collect unique files with hits
file_hits=$(git ls-files -- '*.js' '*.html' '*.css' '*.md' '*.sh' '*.json' '*.txt' '*.pl' '*.yml' '*.yaml' 2>/dev/null \
  | xargs grep -lE "$combined" 2>/dev/null \
  | grep -vE "$EXCLUDE_FILES")

if [ -n "$file_hits" ]; then
  count=$(echo "$file_hits" | wc -l | tr -d ' ')
  echo ""
  echo "   ❌ FAIL: Private info found in $count file(s):"
  echo ""
  echo "$file_hits" | while IFS= read -r f; do
    echo "      📄 $f"
    # Show first 3 matching lines with line numbers (truncated)
    grep -nE "$combined" "$f" 2>/dev/null | head -3 | while IFS= read -r match; do
      linenum=$(echo "$match" | cut -d: -f1)
      content=$(echo "$match" | cut -d: -f2- | cut -c1-60)
      echo "         Line $linenum: ${content}..."
    done
  done
  echo ""
  violations=1
else
  echo "   ✅ PASS"
fi

# ── 2. Check git commit metadata ────────────────────────────────────────────

echo ""
echo "▶ [2/4] Checking git commit metadata..."

bad_emails=$(git log --all --format='%ae%n%ce' 2>/dev/null | sort -u | grep -ivE 'noreply@github\.com|users\.noreply\.github\.com')

if [ -n "$bad_emails" ]; then
  echo ""
  echo "   ❌ FAIL: Non-noreply emails in commit history:"
  echo "$bad_emails" | while IFS= read -r e; do echo "      • $e"; done
  echo ""
  echo "      Fix: git filter-repo --mailmap <mailmap-file>"
  violations=1
else
  echo "   ✅ PASS"
fi

bad_names=$(git log --all --format='%an%n%cn' 2>/dev/null | sort -u | grep -ivE '^davidcarma$|^GitHub$')
if [ -n "$bad_names" ]; then
  echo "   ⚠️  WARN: Review author names: $(echo $bad_names | tr '\n' ' ')"
fi

# ── 3. Check staged changes ─────────────────────────────────────────────────

echo ""
echo "▶ [3/4] Checking staged changes..."

staged=$(git diff --cached --name-only 2>/dev/null)
if [ -n "$staged" ]; then
  staged_hits=$(git diff --cached 2>/dev/null | grep -E "^\+" | grep -vE "^\+\+\+" | grep -E "$combined" | grep -vE "$EXCLUDE_FILES" | head -10)
  if [ -n "$staged_hits" ]; then
    echo ""
    echo "   ❌ FAIL: Private info in staged diff:"
    echo "$staged_hits" | while IFS= read -r line; do
      echo "      ${line:0:70}..."
    done
    violations=1
  else
    echo "   ✅ PASS"
  fi
else
  echo "   ✅ PASS (no staged changes)"
fi

# ── 4. Check for secrets/keys ───────────────────────────────────────────────

echo ""
echo "▶ [4/4] Checking for secrets..."

secret_patterns='(api[_-]?key|secret[_-]?key|password|private[_-]?key|AWS_SECRET|GITHUB_TOKEN)[[:space:]]*[=:]'

secret_files=$(git ls-files -- '*.js' '*.html' '*.json' '*.sh' '*.env' '*.yml' '*.yaml' 2>/dev/null \
  | xargs grep -lE "$secret_patterns" 2>/dev/null \
  | grep -vE "$EXCLUDE_FILES" | head -10)

if [ -n "$secret_files" ]; then
  echo ""
  echo "   ⚠️  WARN: Potential secrets (review manually):"
  echo "$secret_files" | while IFS= read -r f; do
    echo "      📄 $f"
  done
else
  echo "   ✅ PASS"
fi

# ── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════"
if [ $violations -eq 0 ]; then
  echo "✅ PRIVACY SCAN PASSED — safe to push"
else
  echo "❌ PRIVACY SCAN FAILED — fix issues above"
fi
echo "═══════════════════════════════════════"
echo ""

exit $violations
