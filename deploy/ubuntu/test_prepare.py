"""Exercise deployment generation without Docker or real credentials."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class PreparationTest(unittest.TestCase):
    def test_correction_capability_and_legacy_upgrade(self):
        script = Path(__file__).with_name("prepare.py")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def prepare():
                subprocess.run([sys.executable, str(script), "https://test.example"],
                               cwd=root, check=True, capture_output=True)

            def environment(name):
                return dict(line.split("=", 1) for line in
                            (root / "state" / f"{name}.env").read_text().splitlines())

            prepare()
            keyfile = root / "state/credentials.json"
            keys = json.loads(keyfile.read_text())
            provider_file = root / 'state/providers.env'
            provider_file.write_text("PI_OPENAI_KEY='synthetic-test-only'\n")
            pi, memory = environment("pi"), environment("memorygate")
            self.assertEqual(pi["PI_MEMORY_CORRECTION_KEY"], memory["MEMORYGATE_CORRECTION_KEY"])
            self.assertGreaterEqual(len(keys["correction"]), 32)
            self.assertNotIn(keys["correction"], [keys["read"], keys["ingest"], keys["memory"]])
            self.assertEqual(pi["PI_MEMORY_CORRECTION_AGENT_ID"], memory["MEMORYGATE_CORRECTION_AGENT_ID"])
            prepare()
            self.assertEqual(keys, json.loads(keyfile.read_text()))
            self.assertEqual(provider_file.read_text(), "PI_OPENAI_KEY='synthetic-test-only'\n")
            manifest = json.loads((root / 'compose.json').read_text())
            self.assertEqual(manifest['services']['pi']['env_file'][-1], './state/providers.env')
            del keys["correction"]
            keyfile.write_text(json.dumps(keys))
            prepare()
            upgraded = json.loads(keyfile.read_text())
            self.assertTrue(all(upgraded[key] == value for key, value in keys.items()))
            self.assertGreaterEqual(len(upgraded["correction"]), 32)


if __name__ == "__main__":
    unittest.main()
