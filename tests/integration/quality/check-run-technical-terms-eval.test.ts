import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { checkRun } from "@narrative-vox/quality/check-run.ts";
import {
  createMockMorphTokenizer,
  prepareMinimalRun,
  updateEpisodePackFiles,
} from "../../helpers/check-run-test-helpers.ts";

type EvalCategory = "ascii" | "mixed" | "non_ascii";
type MorphMode = "available" | "unavailable";

interface CoverageEvalCase {
  id: string;
  category: EvalCategory;
  script_text: string;
  term: string;
  expected_in_script: boolean;
  gold_in_script: boolean;
  expected_skip: boolean;
  morph_mode: MorphMode;
  morph_tokens?: Record<string, string[]>;
  expected_notation_inconsistencies: Array<{
    term: string;
    variants: string[];
  }>;
}

interface TechnicalTermsAuditReportForEval {
  details: {
    missing_in_script: string[];
    skipped_non_ascii_terms: string[];
    notation_inconsistencies: Array<{
      term: string;
      variants: string[];
    }>;
  };
}

interface EvalMetrics {
  total: number;
  evaluated: number;
  skipped: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
}

interface NotationMetrics {
  notation_targets: number;
  notation_exact_matches: number;
  notation_exact_match_ratio: number;
}

async function loadEvalCases(): Promise<CoverageEvalCase[]> {
  const fixturePath = path.resolve(
    "tests/fixtures/technical-terms-audit/coverage-eval-cases.json",
  );
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw) as CoverageEvalCase[];
}

function collectMetrics(
  entries: Array<{ actual: boolean; gold: boolean; skipped: boolean }>,
): EvalMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (entry.skipped) {
      skipped += 1;
      continue;
    }
    if (entry.actual && entry.gold) {
      tp += 1;
    } else if (entry.actual && !entry.gold) {
      fp += 1;
    } else if (!entry.actual && entry.gold) {
      fn += 1;
    } else {
      tn += 1;
    }
  }

  const evaluated = entries.length - skipped;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  return {
    total: entries.length,
    evaluated,
    skipped,
    tp,
    fp,
    fn,
    tn,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
  };
}

test("checkRun coverage eval fixtures lock expected outcomes and precision/recall metrics", async () => {
  const evalCases = await loadEvalCases();
  const metricInputs: Array<{
    actual: boolean;
    gold: boolean;
    skipped: boolean;
  }> = [];
  let notationTargets = 0;
  let notationExactMatches = 0;

  for (const evalCase of evalCases) {
    const runDir = await prepareMinimalRun(["E01"], {
      E01: evalCase.script_text,
    });
    await updateEpisodePackFiles(runDir, (data) => ({
      ...data,
      technical_terms: [
        {
          term: evalCase.term,
          note: `eval:${evalCase.id}`,
          source_section_ids: ["SRC0001"],
          priority: "normal",
        },
      ],
    }));

    const morphTokenizerOverride =
      evalCase.morph_mode === "available"
        ? createMockMorphTokenizer(evalCase.morph_tokens ?? {})
        : null;
    if (
      evalCase.morph_mode === "available" &&
      evalCase.category === "non_ascii"
    ) {
      assert.ok(
        evalCase.morph_tokens?.[evalCase.script_text],
        `Fixture ${evalCase.id} requires morph_tokens for script_text`,
      );
      assert.ok(
        evalCase.morph_tokens?.[evalCase.term],
        `Fixture ${evalCase.id} requires morph_tokens for term`,
      );
    }

    await checkRun({ runDir, morphTokenizerOverride });
    const reportPath = path.join(
      runDir,
      "reports",
      "technical_terms",
      "E01_technical_terms_audit.json",
    );
    const report = JSON.parse(
      await readFile(reportPath, "utf-8"),
    ) as TechnicalTermsAuditReportForEval;

    const skipped = report.details.skipped_non_ascii_terms.includes(
      evalCase.term,
    );
    const inScript =
      !skipped && !report.details.missing_in_script.includes(evalCase.term);
    const actualNotation = report.details.notation_inconsistencies;
    assert.equal(
      skipped,
      evalCase.expected_skip,
      `Case ${evalCase.id}: expected_skip mismatch`,
    );
    if (!skipped) {
      assert.equal(
        inScript,
        evalCase.expected_in_script,
        `Case ${evalCase.id}: expected_in_script mismatch`,
      );
    }
    assert.deepEqual(
      actualNotation,
      evalCase.expected_notation_inconsistencies,
      `Case ${evalCase.id}: expected_notation_inconsistencies mismatch`,
    );
    if (!skipped) {
      notationTargets += 1;
      if (
        JSON.stringify(actualNotation) ===
        JSON.stringify(evalCase.expected_notation_inconsistencies)
      ) {
        notationExactMatches += 1;
      }
    }

    metricInputs.push({
      actual: inScript,
      gold: evalCase.gold_in_script,
      skipped,
    });
  }

  const metrics = collectMetrics(metricInputs);
  assert.deepEqual(metrics, {
    total: 14,
    evaluated: 13,
    skipped: 1,
    tp: 10,
    fp: 0,
    fn: 0,
    tn: 3,
    precision: 1,
    recall: 1,
  });
  const notationMetrics: NotationMetrics = {
    notation_targets: notationTargets,
    notation_exact_matches: notationExactMatches,
    notation_exact_match_ratio: Number(
      (notationTargets > 0
        ? notationExactMatches / notationTargets
        : 1
      ).toFixed(4),
    ),
  };
  assert.deepEqual(notationMetrics, {
    notation_targets: 13,
    notation_exact_matches: 13,
    notation_exact_match_ratio: 1,
  });
});
