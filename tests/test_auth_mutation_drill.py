"""Keep each security mutation bound to one intentional source location."""

import pytest

from scripts.auth_mutation_drill import CASES, ROOT


@pytest.mark.parametrize("name,filename,old,new,selected", CASES, ids=[case[0] for case in CASES])
def test_auth_mutation_has_one_target(name, filename, old, new, selected):
    source = (ROOT / filename).read_text(encoding="utf-8")
    assert source.count(old) == 1, f"{name}: mutation drifted or became ambiguous"
    assert old != new
    assert selected


def test_a_hung_run_fails_the_drill_with_its_output_kept(tmp_path, monkeypatch, capsys):
    import subprocess

    from scripts import auth_mutation_drill as drill

    for directory in ("scripts", "tests"):
        (tmp_path / directory).mkdir()
    for file in ("conker", "install.sh", "docker-compose.yml", "versions.env"):
        (tmp_path / file).write_text("", encoding="utf-8")

    def hang(*args, **kwargs):
        raise subprocess.TimeoutExpired(args[0], 120, output=b"half a run", stderr=None)

    monkeypatch.setattr(drill, "ROOT", tmp_path)
    monkeypatch.setattr(drill.subprocess, "run", hang)
    assert drill.main() == 1
    assert "FAILED baseline: timed out" in capsys.readouterr().out
    (output,) = tmp_path.glob(".test-gates/auth-mutations-*/baseline/output.txt")
    assert output.read_text(encoding="utf-8") == "half a run\nTimed out after 120 s.\n"
