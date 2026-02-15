# Test Fixtures

`tests/fixtures/sample-run` is a repository-managed fixture run used by automated tests.

- Purpose: keep tests independent from mutable `projects/...` working runs.
- Scope: includes minimal files for blueprint, variables, script, voicevox_text, and voicevox_project.
- Rule: tests should reference `tests/fixtures/...` paths, not `projects/...` paths.
