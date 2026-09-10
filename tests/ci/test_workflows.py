"""Offline regression checks for the two-workflow CI topology (requires PyYAML)."""
from pathlib import Path
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / '.github/workflows'


def workflow(name):
    # PyYAML's YAML 1.1 loader treats the Actions key `on` as True.
    data = yaml.safe_load((WORKFLOWS / name).read_text())
    data['on'] = data.get('on', data.get(True))
    return data


class Workflows(unittest.TestCase):
    def test_only_tests_and_pages(self):
        self.assertEqual({p.name for p in WORKFLOWS.iterdir() if p.suffix in ('.yml', '.yaml')},
                         {'tests.yml', 'pages.yml'})

    def test_all_changes_are_tested(self):
        events = workflow('tests.yml')['on']
        self.assertEqual(set(events), {'push', 'pull_request', 'workflow_dispatch'})
        self.assertEqual(events['push'], {'branches': ['main']})
        self.assertIsNone(events['pull_request'])

    def test_every_legacy_browser_suite_is_kept(self):
        jobs = workflow('tests.yml')['jobs']
        expected = {
            'app-library', 'clipboard', 'desktop-features', 'desktop-refinement',
            'file-pickers', 'file-workflows', 'integrated-shell', 'orbit', 'shell-launch',
            'themes', 'ui-refinement', 'visual-materials', 'web-apps', 'web-chrome', 'web-io',
        }
        chromium = [s for shard in jobs['chromium']['strategy']['matrix']['include']
                    for s in shard['suites'].split()]
        self.assertEqual(set(chromium), expected)
        self.assertEqual(len(chromium), len(expected))
        firefox = {s for shard in jobs['firefox']['strategy']['matrix']['include']
                   for s in shard['suites'].split()}
        self.assertEqual(firefox, {'app-library', 'clipboard', 'desktop-refinement',
                                  'file-pickers', 'orbit', 'ui-refinement', 'web-io'})
        for suite in expected:
            self.assertTrue((ROOT / f'tests/{suite}/browser.py').is_file())
        script = (ROOT / '.github/scripts/browser-tests.sh').read_text()
        self.assertIn('--standalone', script)
        self.assertIn('PIPESTATUS[0]', script)
        self.assertIn('exit "$failed"', script)

    def test_platform_gpu_live_and_rebuild_coverage(self):
        text = (WORKFLOWS / 'tests.yml').read_text()
        for command in (
            'tests/smoke.py', 'tests/themes/browser.py --gpu --headed',
            'tests/visual-materials/browser.py --gpu --headed',
            'tests/web-apps/browser.py --live --gpu --headed',
            'tests/orbit/browser.py --live', 'tests/web-chrome/browser.py --live',
            'tests/web-io/live.py', 'tests/win32/native-gui.py', 'tests/themes/native.py',
            'tests/win32/native-apps.py', 'native/win32/build.py', 'third-party/winemine/build.py',
            'tests/win32/apps-browser.py --gpu --headed --standalone',
        ):
            self.assertIn(command, text)
        jobs = workflow('tests.yml')['jobs']
        self.assertEqual(jobs['macos']['runs-on'], 'macos-15-intel')
        self.assertEqual(jobs['native-windows']['runs-on'], 'windows-latest')
        self.assertEqual(jobs['native-cross-check']['needs'], 'win32')

    def test_summary_cannot_hide_skipped_or_failed_jobs(self):
        jobs = workflow('tests.yml')['jobs']
        summary = jobs['test-result']
        self.assertEqual(set(summary['needs']), set(jobs) - {'test-result'})
        self.assertEqual(summary['if'], 'always()')
        self.assertIn("job['result'] != 'success'", summary['steps'][0]['run'])
        for job in jobs.values():
            self.assertNotIn('continue-on-error', job)
            for step in job.get('steps', []):
                self.assertNotIn('continue-on-error', step)

    def test_read_only_tests_and_scoped_deployment(self):
        tests = workflow('tests.yml')
        self.assertEqual(tests['permissions'], {'contents': 'read'})
        self.assertNotIn('contents: write', (WORKFLOWS / 'tests.yml').read_text())
        self.assertNotIn('actions: write', (WORKFLOWS / 'tests.yml').read_text())
        pages = workflow('pages.yml')
        self.assertEqual(pages['permissions'], {'contents': 'read'})
        self.assertEqual(pages['jobs']['deploy']['permissions']['pages'], 'write')
        self.assertEqual(pages['jobs']['deploy']['permissions']['id-token'], 'write')
        for doc in (tests, pages):
            for job in doc['jobs'].values():
                for step in job.get('steps', []):
                    if step.get('uses', '').startswith('actions/checkout@'):
                        self.assertIs(step['with']['persist-credentials'], False)

    def test_pages_requires_tests_for_exact_own_main_commit(self):
        pages = workflow('pages.yml')
        self.assertEqual(pages['on']['workflow_run'],
                         {'workflows': ['Tests'], 'types': ['completed'], 'branches': ['main']})
        self.assertNotIn('push', pages['on'])
        gate = pages['jobs']['verified-commit']['steps'][0]['with']['script']
        for guard in ("run.head_sha !== sha", "run.conclusion !== 'success'",
                      "run.head_branch !== 'main'", "run.path !== '.github/workflows/tests.yml'",
                      'run.head_repository?.full_name', "context.ref !== 'refs/heads/main'",
                      "if (!run) throw new Error"):
            self.assertIn(guard, gate)
        self.assertEqual(pages['jobs']['build']['steps'][0]['with']['ref'],
                         '${{ needs.verified-commit.outputs.sha }}')
        self.assertIs(pages['concurrency']['cancel-in-progress'], False)
        self.assertIn('process.env.TESTED_SHA', pages['jobs']['deploy']['steps'][0]['with']['script'])

    def test_artifacts_are_unique_and_failure_evidence_is_kept(self):
        names = []
        for job in workflow('tests.yml')['jobs'].values():
            for step in job.get('steps', []):
                if step.get('uses', '').startswith('actions/upload-artifact@'):
                    names.append(step['with']['name'])
                    self.assertEqual(step.get('if'), 'always()')
                    self.assertEqual(step['with']['retention-days'], 14)
        self.assertEqual(len(names), len(set(names)))


if __name__ == '__main__':
    unittest.main()
