"""Keep each security mutation bound to one intentional source location."""

import pytest

from scripts.auth_mutation_drill import CASES, ROOT


@pytest.mark.parametrize("name,filename,old,new,selected", CASES, ids=[case[0] for case in CASES])
def test_auth_mutation_has_one_target(name, filename, old, new, selected):
    source = (ROOT / filename).read_text(encoding="utf-8")
    assert source.count(old) == 1, f"{name}: mutation drifted or became ambiguous"
    assert old != new
    assert selected
