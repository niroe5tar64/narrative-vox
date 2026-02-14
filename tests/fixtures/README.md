# Test Fixtures

`tests/fixtures/sample-run` is a repository-managed fixture run used by automated tests.

- Purpose: keep tests independent from mutable `projects/...` working runs.
- Scope: includes minimal files for stage1, stage2, stage3, stage4 (`voicevox_text`), and stage5 (`voicevox_project`).
- Rule: tests should reference `tests/fixtures/...` paths, not `projects/...` paths.
