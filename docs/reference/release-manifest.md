# Release compatibility manifest

`versions.env` is Conker's authoritative, machine-readable release contract. It
contains the manifest schema, the exact dashboard Git tree, all five Conker gate
versions, and digest-pinned third-party images. Compose consumes the same file;
there is no second list of release pins.

Inspect the normalized contract while developing:

```sh
python scripts/release_manifest.py --json
```

Before building, publishing, installing, or promoting a release, run the strict
checkout check:

```sh
python scripts/release_manifest.py --check
```

The JSON form validates and normalizes the declared contract without requiring a
clean dashboard checkout. The strict check also rejects dirty dashboard sources
and a revision that does not match `HEAD:dashboard`; CI and release automation
must use it and record the normalized JSON with release evidence.

## Updating a release

1. Update the five gate versions only after their compatibility tests pass.
2. Resolve every third-party image to `repository@sha256:<digest>`. Version tags,
   including `latest`, are rejected because an upstream owner can move them.
3. After changing `dashboard/`, set `CONKER_DASHBOARD_REVISION` to the output of
   `git rev-parse HEAD:dashboard` from the commit being released.
4. Increment `RELEASE_MANIFEST_VERSION` only when the fields or their meaning
   change, then update the validator and consumers together.
5. Run `python -m pytest tests/test_release_manifest.py -q` and the installer
   suite before promotion.

The dashboard uses a Git tree object rather than the repository commit. This is
still an exact content identity, while avoiding an impossible self-reference:
changing `versions.env` changes the repository commit that would otherwise need
to be written into itself.
