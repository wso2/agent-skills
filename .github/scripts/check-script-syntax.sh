#!/usr/bin/env bash
# Syntax-checks every bundled script under plugins/ without executing it.
# Node files are parsed with `node --check`, shell files with `bash -n`.
# Run from the repo root:
#   .github/scripts/check-script-syntax.sh
# Exits 1 if any file has a syntax error, 0 otherwise.

set -u
fail=0

while IFS= read -r f; do
  echo "node --check $f"
  node --check "$f" || fail=1
done < <(find plugins -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \))

while IFS= read -r f; do
  echo "bash -n $f"
  bash -n "$f" || fail=1
done < <(find plugins -type f -name '*.sh')

exit "$fail"
