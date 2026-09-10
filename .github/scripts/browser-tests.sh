#!/usr/bin/env bash
# Run existing suites unchanged, retaining every failure instead of stopping a shard.
set -uo pipefail
engine=${1:?Expected chromium or firefox}
shift
case "$engine" in chromium|firefox) ;; *) echo "Unknown engine: $engine" >&2; exit 2 ;; esac
mkdir -p tests/ci/artifacts
failed=0
run_case() {
  local name=$1 limit=$2
  shift 2
  echo "::group::$name"
  timeout --signal=TERM --kill-after=10s "${limit}s" "$@" 2>&1 | tee "tests/ci/artifacts/$name.log"
  local result=${PIPESTATUS[0]}
  echo '::endgroup::'
  if ((result)); then
    echo "::error::$name failed (exit $result)"
    failed=1
  fi
}
for suite in "$@"; do
  case "$suite" in
    app-library|clipboard|desktop-features|desktop-refinement|file-pickers|file-workflows|integrated-shell|orbit|shell-launch|themes|ui-refinement|visual-materials|web-apps|web-chrome|web-io) ;;
    *) echo "Unknown suite: $suite" >&2; exit 2 ;;
  esac
  limit=600
  [[ $suite != orbit ]] || limit=180
  [[ $suite != clipboard ]] || limit=300
  if [[ $engine == firefox ]]; then
    [[ $suite != orbit ]] || export DEBUG=pw:api
    run_case "$engine-$suite" "$limit" python -u "tests/$suite/browser.py" --engine firefox --output "tests/$suite/artifacts/firefox"
    unset DEBUG
  else
    run_case "$engine-$suite-http" "$limit" python -u "tests/$suite/browser.py"
    # These two runners already own their format/offline or host-fixture coverage.
    if [[ $suite != desktop-features && $suite != web-apps ]]; then
      run_case "$engine-$suite-standalone" "$limit" python -u "tests/$suite/browser.py" --standalone --output "tests/$suite/artifacts/standalone"
    fi
  fi
done
exit "$failed"
