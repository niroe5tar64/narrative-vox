/**
 * テキスト系として扱うファイル拡張子のセット。
 * これに含まれない拡張子のファイルは 415 Unsupported Media Type を返す。
 */
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".json",
  ".jsonl",
  ".ts",
  ".js",
  ".mjs",
  ".cjs",
  ".yaml",
  ".yml",
  ".toml",
  ".env",
  ".sh",
  ".xml",
  ".csv",
]);

/**
 * ファイル名の拡張子がテキスト系かどうかを判定する。
 *
 * @param filename - 判定するファイル名（拡張子を含む）
 * @returns テキスト系拡張子なら true
 */
export function isTextExtension(filename: string): boolean {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) return false;
  return TEXT_EXTENSIONS.has(filename.slice(dotIndex).toLowerCase());
}
