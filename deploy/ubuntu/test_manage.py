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
