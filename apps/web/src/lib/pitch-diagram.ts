export function splitMora(pronunciation: string): string[] {
  const COMBINING = new Set("ァィゥェォャュョヮ");
  const morae: string[] = [];
  for (const ch of pronunciation) {
    if (COMBINING.has(ch) && morae.length > 0) {
      morae[morae.length - 1] += ch;
    } else {
      morae.push(ch);
    }
  }
  return morae;
}

export function getPitchPattern(
  morae: string[],
  accentType: number,
): ("H" | "L")[] {
  return morae.map((_, i) => {
    if (accentType === 0) return i === 0 ? "L" : "H";
    if (accentType === 1) return i === 0 ? "H" : "L";
    if (i === 0) return "L";
    return i < accentType ? "H" : "L";
  });
}

export function buildPitchDiagram(
  pronunciation: string,
  accentType: number,
): string {
  if (!pronunciation) return "";
  const morae = splitMora(pronunciation);
  if (morae.length === 0) return "";
  const pattern = getPitchPattern(morae, accentType);
  let result = "";
  for (let i = 0; i < morae.length; i++) {
    result += morae[i];
    if (i < morae.length - 1) {
      if (pattern[i] === "L" && pattern[i + 1] === "H") result += "↑";
      else if (pattern[i] === "H" && pattern[i + 1] === "L") result += "↓";
    }
  }
  return result;
}
