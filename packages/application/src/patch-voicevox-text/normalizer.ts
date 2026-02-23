import type { NormalizationRule, VoicevoxTextUtterance } from "@narrative-vox/domain/types.ts";

export function applyNormalizationRules(
  utterances: VoicevoxTextUtterance[],
  rules: NormalizationRule[],
): { utterances: VoicevoxTextUtterance[]; appliedCount: number } {
  const enabledRules = rules.filter((rule) => rule.enabled);
  let appliedCount = 0;

  const normalized = utterances.map((utterance) => {
    let text = utterance.text;
    for (const rule of enabledRules) {
      const re = new RegExp(rule.pattern, "g");
      const next = text.replace(re, rule.replacement);
      if (next !== text) {
        appliedCount++;
        text = next;
      }
    }

    if (text.trim().length === 0) {
      return utterance;
    }

    return text === utterance.text ? utterance : { ...utterance, text };
  });

  return { utterances: normalized, appliedCount };
}
