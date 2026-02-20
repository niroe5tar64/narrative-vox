import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IpadicFeatures, Tokenizer } from "kuromoji";

export type MorphTokenizer = Tokenizer<IpadicFeatures>;

function resolveKuromojiDictPath(): string | undefined {
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "node_modules/kuromoji/dict"),
    path.resolve(currentFileDir, "../../node_modules/kuromoji/dict")
  ];
  return candidates.find((candidatePath) => existsSync(candidatePath));
}

async function buildJapaneseMorphTokenizer(): Promise<MorphTokenizer | null> {
  const dictPath = resolveKuromojiDictPath();
  if (!dictPath) {
    return null;
  }

  try {
    const kuromojiModule = (await import("kuromoji")) as {
      builder?: typeof import("kuromoji").builder;
      default?: { builder?: typeof import("kuromoji").builder };
    };

    const builder = kuromojiModule.builder ?? kuromojiModule.default?.builder;
    if (!builder) {
      return null;
    }

    return await new Promise<MorphTokenizer | null>((resolve) => {
      builder({ dicPath: dictPath }).build((error, tokenizer) => {
        if (error || !tokenizer) {
          resolve(null);
          return;
        }
        resolve(tokenizer);
      });
    });
  } catch {
    return null;
  }
}

let cachedMorphTokenizer: MorphTokenizer | null | undefined;
let cachedMorphTokenizerPromise: Promise<MorphTokenizer | null> | undefined;

export async function getJapaneseMorphTokenizer(): Promise<MorphTokenizer | null> {
  if (cachedMorphTokenizer !== undefined) {
    return cachedMorphTokenizer;
  }

  if (!cachedMorphTokenizerPromise) {
    cachedMorphTokenizerPromise = buildJapaneseMorphTokenizer();
  }

  cachedMorphTokenizer = await cachedMorphTokenizerPromise;
  return cachedMorphTokenizer;
}
