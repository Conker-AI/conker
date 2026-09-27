# Capability matrix

`capabilities.json` is the machine-readable inventory of Conker's current product
capability families. It records, independently, the authoritative component,
gateway routes, connected UI routes, CLI commands, deployment requirements and
literal repository evidence for each claim.

`active` means the operation has at least one real product surface. It does not
mean UI, CLI and API parity: empty surface arrays are deliberate and expose those
gaps. `deferred` means the family is not a connected product operation even when
lower-level service code or legacy fixtures exist. Deferred rows must expose no
product surface and must explain the gap.

Run the contract locally:

```console
python scripts/validate_capabilities.py
python scripts/validate_capabilities.py --json
python -m pytest tests/test_capability_matrix.py -q
```

The validator pins the required family IDs, validates schema and state rules,
keeps evidence paths inside the repository, and confirms every cited literal still
exists. Adding, removing, promoting or deferring a capability therefore requires an
intentional matrix and test update. CI runs the validator before the wider suite.

The matrix describes source-tree capability truth. The assembled release gate still
owns proof that declared images, credentials, live health, setup, conversation and
recovery work together on a disposable installation.
