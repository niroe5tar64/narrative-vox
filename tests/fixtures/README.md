# Test Fixtures

`tests/fixtures/sample-run` is a repository-managed fixture run used by automated tests.

- Purpose: keep tests independent from mutable `data/projects/...` working runs.
- Scope: includes minimal files for blueprint, material, script, voicevox_text, and voicevox_project.
- Rule: tests should reference `tests/fixtures/...` paths, not `data/projects/...` paths.
