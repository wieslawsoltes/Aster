"""Execute the actual inline Pages gate with mock GitHub metadata, never a token."""
from pathlib import Path
import copy
import json
import subprocess
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = yaml.safe_load((ROOT / '.github/workflows/pages.yml').read_text())
GATE = WORKFLOW['jobs']['verified-commit']['steps'][0]['with']['script']
SHA = 'a' * 40
RUN = {
    'id': 1234, 'run_attempt': 2, 'status': 'completed', 'conclusion': 'success',
    'head_sha': SHA, 'head_branch': 'main', 'path': '.github/workflows/tests.yml',
    'head_repository': {'full_name': 'wieslawsoltes/Aster'}, 'event': 'push',
}
HARNESS = r"""
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const result = {outputs: {}, errors: [], summaries: [], calls: []};
const summary = {
  addHeading(value) { result.summaries.push(value); return this; },
  addRaw(value) { result.summaries.push(value); return this; },
  async write() { result.summaryWritten = true; }
};
const core = {
  summary, setOutput: (key, value) => { result.outputs[key] = value; },
  setFailed: value => result.errors.push(value), notice: () => {}
};
const github = {rest: {
  git: {getRef: async args => {result.calls.push(['ref', args]); return {data: {object: {sha: input.main}}};}},
  actions: {
    getWorkflowRun: async args => {
      result.calls.push(['get', args]);
      if (input.fetchError) throw Error('GitHub metadata unavailable');
      return {data: input.latest};
    },
    listWorkflowRuns: async args => {result.calls.push(['list', args]); return {data: {workflow_runs: input.runs}};}
  }
}};
(async () => {
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('github', 'context', 'core', input.gate)(github, input.context, core);
  } catch (error) { result.errors.push(error.message); }
  process.stdout.write(JSON.stringify(result));
})().catch(error => { console.error(error); process.exit(1); });
"""


class PagesGate(unittest.TestCase):
    def run_gate(self, *, latest=None, event=None, manual=False, main=SHA,
                 runs=None, ref='refs/heads/main', fetch_error=False):
        data = {
            'gate': GATE, 'main': main, 'latest': copy.deepcopy(RUN if latest is None else latest),
            'runs': runs or [], 'fetchError': fetch_error,
            'context': {'repo': {'owner': 'wieslawsoltes', 'repo': 'Aster'}, 'ref': ref,
                        'payload': {} if manual else {'workflow_run': event or RUN}},
        }
        completed = subprocess.run(['node', '-e', HARNESS], input=json.dumps(data),
                                   text=True, capture_output=True, timeout=10, check=True)
        return json.loads(completed.stdout)

    def assert_blocked(self, result):
        self.assertEqual(result['outputs'].get('deploy'), 'false')
        self.assertNotIn('sha', result['outputs'])
        self.assertTrue(result['errors'], result)

    def test_successful_latest_attempt_deploys_exact_current_main(self):
        result = self.run_gate()
        self.assertEqual(result['outputs'], {'deploy': 'true', 'sha': SHA})
        self.assertEqual(result['errors'], [])
        self.assertEqual([args['run_id'] for call, args in result['calls'] if call == 'get'], [1234])

    def test_retry_refreshes_old_failed_event_payload(self):
        result = self.run_gate(event={**RUN, 'run_attempt': 1, 'conclusion': 'failure'})
        self.assertEqual(result['outputs']['deploy'], 'true')
        self.assertEqual(result['errors'], [])

    def test_latest_failed_attempt_cannot_use_stale_success_payload(self):
        result = self.run_gate(latest={**RUN, 'conclusion': 'failure'})
        self.assert_blocked(result)
        self.assertTrue(result['summaryWritten'])
        summary = '\n'.join(result['summaries'])
        self.assertIn('Pages deployment blocked by Tests', summary)
        self.assertIn('/actions/runs/1234', summary)
        self.assertIn('failure', summary)

    def test_incomplete_cancelled_and_skipped_tests_never_deploy(self):
        for status, conclusion in [('in_progress', None), ('queued', None),
                                   ('completed', 'cancelled'), ('completed', 'skipped')]:
            with self.subTest(status=status, conclusion=conclusion):
                self.assert_blocked(self.run_gate(latest={**RUN, 'status': status, 'conclusion': conclusion}))

    def test_api_failure_fails_closed(self):
        self.assert_blocked(self.run_gate(fetch_error=True))

    def test_foreign_repo_branch_workflow_or_event_is_rejected(self):
        for change in [
            {'head_repository': {'full_name': 'other/Aster'}}, {'head_repository': None},
            {'head_branch': 'feature'}, {'path': '.github/workflows/other.yml'},
            {'event': 'pull_request'},
        ]:
            with self.subTest(change=change):
                self.assert_blocked(self.run_gate(latest={**RUN, **change}))

    def test_stale_commit_is_not_published(self):
        result = self.run_gate(main='b' * 40)
        self.assertEqual(result['outputs'], {'deploy': 'false'})
        self.assertEqual(result['errors'], [])

    def test_manual_requires_successful_tests_on_current_main(self):
        result = self.run_gate(manual=True, runs=[RUN])
        self.assertEqual(result['outputs'], {'deploy': 'true', 'sha': SHA})
        args = next(args for call, args in result['calls'] if call == 'list')
        self.assertEqual(args['head_sha'], SHA)
        self.assertEqual(args['workflow_id'], 'tests.yml')
        for runs in [[], [{**RUN, 'conclusion': 'failure'}], [{**RUN, 'head_sha': 'b' * 40}]]:
            with self.subTest(runs=runs):
                self.assert_blocked(self.run_gate(manual=True, runs=runs))

    def test_manual_on_another_branch_is_rejected(self):
        self.assert_blocked(self.run_gate(manual=True, runs=[RUN], ref='refs/heads/feature'))

    def test_unsuccessful_tests_reach_diagnostics_not_a_silent_job_skip(self):
        condition = WORKFLOW['jobs']['verified-commit']['if']
        self.assertNotIn('conclusion', condition)
        self.assertIn('head_repository.full_name == github.repository', condition)
        self.assertIn("run.conclusion !== 'success'", GATE)
        self.assertEqual(WORKFLOW['jobs']['build']['if'], "needs.verified-commit.outputs.deploy == 'true'")


if __name__ == '__main__':
    unittest.main()
