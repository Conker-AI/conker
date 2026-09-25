import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('manage', Path(__file__).with_name('manage.py'))
manage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manage)


class ManageTest(unittest.TestCase):
    def test_apply_without_confirmation_never_restarts_services(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, CONKER_DEPLOY_DIR=directory), contextlib.redirect_stdout(io.StringIO()):
            (Path(directory) / 'compose.json').write_text('{}')
            with patch.object(manage.sys.stdin, 'isatty', return_value=True), patch('builtins.input', return_value='n'), patch.object(manage.subprocess, 'run') as run:
                self.assertEqual(manage.main(['models', 'apply']), 1)
                run.assert_not_called()

    def test_paid_provider_without_consent_does_not_collect_or_save_key(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, CONKER_DEPLOY_DIR=directory), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            root = Path(directory)
            (root / 'state').mkdir()
            (root / 'compose.json').write_text(json.dumps({'services': {'pi': {'env_file': ['./state/providers.env']}}}))
            result = subprocess.CompletedProcess([], 0, json.dumps({'configuration': {'providers': [], 'models': []}}), '')
            with patch.object(manage.sys.stdin, 'isatty', return_value=True), patch('builtins.input', side_effect=['hosted', 'test-model', 'n']), patch.object(manage.getpass, 'getpass') as secret, patch.object(manage.subprocess, 'run', return_value=result) as run:
                self.assertEqual(manage.main(['models', 'connect', 'openai']), 1)
                secret.assert_not_called()
                self.assertEqual(run.call_count, 1)
                self.assertFalse((root / 'state/providers.env').exists())

    def test_connect_stages_key_without_sending_it_to_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'state').mkdir()
            (root / 'compose.json').write_text(json.dumps({'services': {'pi': {'env_file': ['./state/providers.env']}}}))
            output = io.StringIO()
            reads = subprocess.CompletedProcess([], 0, json.dumps({'configuration': {'providers': [], 'models': []}}), '')
            registered = subprocess.CompletedProcess([], 0, 'Model registered', '')
            args = manage.parser().parse_args(['models', 'connect', 'openai'])
            with patch('builtins.input', side_effect=['hosted-answer', 'test-model', 'y']), patch.object(manage.sys.stdin, 'isatty', return_value=True), patch.object(manage.getpass, 'getpass', return_value='synthetic-private-key'), patch.object(manage.subprocess, 'run', side_effect=[reads, registered]) as run, contextlib.redirect_stdout(output):
                self.assertEqual(manage.connect_provider(args, root, ['docker', 'compose']), 0)
                self.assertNotIn('synthetic-private-key', repr(run.call_args_list))
                self.assertNotIn('synthetic-private-key', output.getvalue())
                self.assertEqual(run.call_count, 2)
            self.assertIn('synthetic-private-key', (root / 'state/providers.env').read_text())

    def test_private_provider_file_preserves_other_providers_and_rejects_injection(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'providers.env'
            path.write_text("PI_ANTHROPIC_KEY='old-test-key'\nPI_OPENAI_KEY='replaced'\n")
            manage.save_provider_file(path, 'PI_OPENAI_KEY', 'synthetic-test_KEY', True)
            value = path.read_text()
            self.assertIn("PI_ANTHROPIC_KEY='old-test-key'", value)
            self.assertIn("PI_OPENAI_KEY='synthetic-test_KEY'", value)
            self.assertNotIn('replaced', value)
            self.assertIn('PI_ALLOW_PAID_MODELS=true', value)
            for invalid in ['key\nEVIL=yes', "key'", '', 'key\x00', '$KEY']:
                with self.assertRaises(ValueError):
                    manage.save_provider_file(path, 'PI_OPENAI_KEY', invalid, False)
                self.assertEqual(path.read_text(), value)

    def test_missing_deployment_does_not_call_docker(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, CONKER_DEPLOY_DIR=directory), patch.object(manage.subprocess, 'run') as run, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(manage.main(['status']), 1)
            run.assert_not_called()

    def test_doctor_detects_missing_stopped_and_unhealthy_services(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, CONKER_DEPLOY_DIR=directory), contextlib.redirect_stdout(io.StringIO()):
            root = Path(directory)
            (root / 'compose.json').write_text(json.dumps({'services': {'pi': {}, 'gateway': {}}}))
            for rows, expected in [([], 1), ([{'Service': 'pi', 'State': 'running'}, {'Service': 'gateway', 'State': 'running', 'Health': 'unhealthy'}], 1), ([{'Service': 'pi', 'State': 'running'}, {'Service': 'gateway', 'State': 'running'}], 0)]:
                result = subprocess.CompletedProcess([], 0, json.dumps(rows), '')
                with patch.object(manage.subprocess, 'run', return_value=result):
                    self.assertEqual(manage.main(['doctor']), expected)

    def test_model_id_is_data_not_shell_code(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, CONKER_DEPLOY_DIR=directory), contextlib.redirect_stdout(io.StringIO()):
            (Path(directory) / 'compose.json').write_text('{}')
            result = subprocess.CompletedProcess([], 0, 'Saved', '')
            model = 'test;$(not-a-command)'
            with patch.object(manage.subprocess, 'run', return_value=result) as run:
                self.assertEqual(manage.main(['models', 'use', model]), 0)
                self.assertNotIn(model, run.call_args.args[0])
                self.assertEqual(json.loads(run.call_args.kwargs['input'])['model'], model)


if __name__ == '__main__':
    unittest.main()
