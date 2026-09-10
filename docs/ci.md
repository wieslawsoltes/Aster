# Continuous integration and Pages

The default branch has exactly two workflow files:

- **Tests** (`.github/workflows/tests.yml`) runs on every pull request, push to
  `main`, or manual dispatch. This includes SDK, assets, CI and documentation
  changes; no path filter can silently miss a new runtime file.
- **GitHub Pages** (`.github/workflows/pages.yml`) publishes only a successful
  Tests commit from this repository's current `main`. Manual redeployment has
  the same test gate; it is not an override. Old completed runs cannot roll the
  website back after `main` advances.

## Test organization

The source/model/standalone check runs once, not once per feature. Chromium uses
four shards (shell, appearance, files/apps, browser/clipboard); Firefox uses two.
Each shard retains all former HTTP, IndexedDB, standalone and offline cases.
A failed case is recorded and remaining cases in that shard still run. Matrix
fail-fast is disabled. Time limits fail tests rather than silently skipping them.

Separate jobs preserve production WebGPU/CPU comparisons, the live application
catalog, actual Google/external application transfers, native macOS clipboard,
shipped/rebuilt Win32 programs, Windows GUI/format references, Windows validation
of browser-generated output and the offline bundled WineMine source rebuild.
The obsolete upstream fixture-download/build workflow is not needed: the pinned
bundled-source reproducibility test remains in Tests.

`All tests passed` depends on every group and fails if any dependency failed,
was cancelled, or was skipped. It is the single aggregate check to require in
branch protection, should protection be enabled. This cleanup does not change
repository protection rules.

Tests have read-only repository permissions; checkout credentials are not
persisted. Only the Pages deployment job receives Pages and OIDC write access.
Pages checks out the exact approved SHA, rebuilds the standalone reproducibly,
publishes the established runtime allowlist, and records actual checkout/file
hashes in `deployment.json`. It never consumes a pull request's artifact or runs
pull request code with deployment credentials. The desktop smoke suite is part
of Tests instead of being redundantly installed and run in Pages.

## Evidence and local checks

`tested-source` contains one complete source archive and SHA-256 manifest per
Tests run. Suite-specific artifacts retain reports, screenshots and command
logs, including failure evidence, for 14 days. This replaces repeated source
archives in every feature artifact. Historical workflow runs/artifacts are not
deleted: they remain useful evidence for previous releases. GitHub may still
show retired workflow names in its history even though their files are absent
from `main`. No bootstrap, transfer or code-writing workflow is added.

```sh
python -m pip install PyYAML
python -m unittest discover -s tests/ci -p 'test_*.py' -v
bash .github/scripts/check-source.sh
# Test-only browser tools, then selected existing suites (Linux):
python -m pip install playwright pillow
python -m playwright install --with-deps chromium firefox
bash .github/scripts/browser-tests.sh chromium clipboard orbit
bash .github/scripts/browser-tests.sh firefox clipboard orbit
```

The CI topology tests enforce the two-file limit, all migrated suite entries,
platform/native coverage, permissions, artifact naming and deployment gate.
Application source, security policies and browser assertions are unchanged by
this workflow consolidation. Unmerged feature branches, including native Orbit,
are preserved; their code must integrate into Tests when subsequently merged,
rather than reintroducing retired workflows.
