#!/usr/bin/env bash
# Pandoc Lua-filter fixture runner.
#
# For each `NN-*.input.md` fixture: pipe through pandoc with the
# mdz-filter.lua, capture the stderr + stdout, and compare against
# `NN-*.expected.md` if present. If there's no `.expected.md`, fall
# back to a "filter-loads-and-emits-nonempty-output" smoke check.
#
# We deliberately do NOT pin expected output for every fixture yet —
# pandoc 3.x emits subtly different whitespace across point releases.
# The smoke check ensures the filter didn't crash or emit a completely
# empty document; the pinned-expected fixtures cover the directives
# where the semantic output is stable.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILTER="$SCRIPT_DIR/../mdz-filter.lua"

pass=0
fail=0
failures=()

for input in "$SCRIPT_DIR"/*.input.md; do
    name=$(basename "$input" .input.md)
    expected="$SCRIPT_DIR/$name.expected.md"
    actual=$(pandoc --lua-filter="$FILTER" --from=markdown --to=markdown --wrap=none < "$input" 2>/tmp/mdz-stderr-$$.log || true)
    stderr=$(cat /tmp/mdz-stderr-$$.log 2>/dev/null || true)
    rm -f /tmp/mdz-stderr-$$.log

    if [ -z "$actual" ]; then
        fail=$((fail + 1))
        failures+=("$name: filter emitted empty output; stderr=$stderr")
        continue
    fi

    if [ -f "$expected" ]; then
        if ! diff -u "$expected" <(printf '%s\n' "$actual") > /tmp/mdz-diff-$$.log 2>&1; then
            fail=$((fail + 1))
            failures+=("$name: output differs from expected — $(head -5 /tmp/mdz-diff-$$.log)")
            rm -f /tmp/mdz-diff-$$.log
            continue
        fi
        rm -f /tmp/mdz-diff-$$.log
    fi

    pass=$((pass + 1))
    echo "  [OK] $name"
done

echo ""
echo "Pandoc fixtures: $pass passed, $fail failed"
if [ $fail -gt 0 ]; then
    echo ""
    echo "Failures:"
    for f in "${failures[@]}"; do
        echo "  - $f"
    done
    exit 1
fi
