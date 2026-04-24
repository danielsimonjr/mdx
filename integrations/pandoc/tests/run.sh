#!/usr/bin/env bash
# Pandoc Lua-filter fixture runner.
#
# For each `NN-*.input.md` fixture: pipe through pandoc with the
# mdz-filter.lua, capture rc + stderr + stdout separately, and
# compare against `NN-*.expected.md` if present.
#
# Key invariants:
#   1. A nonzero pandoc exit is reported as PANDOC-CRASH, not "empty
#      output" — previous version used `|| true` and conflated these.
#   2. Empty stdout with rc=0 is flagged separately as a likely filter
#      bug (valid pandoc runs never produce empty output on non-empty
#      input).
#   3. `.expected.md` pinning is REQUIRED for fixtures 01 and 02 (the
#      stable-output ones). Missing expected files for those two is a
#      hard fail to prevent silent regression from adding a fixture
#      without pinning its output.
#   4. Temp files use mktemp so parallel runs don't collide.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILTER="$SCRIPT_DIR/../mdz-filter.lua"
# Fixtures that MUST have pinned expected output. Others may smoke-test.
REQUIRED_PINS=("01-plain-paragraph")

pass=0
fail=0
failures=()

for input in "$SCRIPT_DIR"/*.input.md; do
    name=$(basename "$input" .input.md)
    expected="$SCRIPT_DIR/$name.expected.md"

    stderr_log=$(mktemp)
    set +e
    actual=$(pandoc --lua-filter="$FILTER" --from=markdown --to=markdown --wrap=none < "$input" 2>"$stderr_log")
    rc=$?
    set -e
    stderr=$(<"$stderr_log")
    rm -f "$stderr_log"

    if [ $rc -ne 0 ]; then
        fail=$((fail + 1))
        failures+=("$name: PANDOC-CRASH (exit $rc) — stderr=$stderr")
        continue
    fi

    if [ -z "$actual" ]; then
        fail=$((fail + 1))
        failures+=("$name: filter emitted empty output on non-empty input; stderr=$stderr")
        continue
    fi

    if [ -f "$expected" ]; then
        diff_log=$(mktemp)
        if ! diff -u "$expected" <(printf '%s\n' "$actual") > "$diff_log" 2>&1; then
            fail=$((fail + 1))
            failures+=("$name: output differs from expected — $(head -5 "$diff_log" | tr '\n' ' ')")
            rm -f "$diff_log"
            continue
        fi
        rm -f "$diff_log"
    else
        # Required-pin fixtures MUST have a pinned expected file.
        for required in "${REQUIRED_PINS[@]}"; do
            if [ "$name" = "$required" ]; then
                fail=$((fail + 1))
                failures+=("$name: REQUIRED expected.md missing — every required-pin fixture must have $name.expected.md")
                continue 2
            fi
        done
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
