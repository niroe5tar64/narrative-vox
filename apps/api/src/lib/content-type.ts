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
 * テキスト系として扱うMIMEタイプのプレフィックス/完全一致リスト。
 */
const TEXT_MIME_PREFIXES = [
	"text/",
	"application/json",
	"application/ld+json",
	"application/xml",
	"application/javascript",
	"application/x-yaml",
	"application/yaml",
];

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

/**
 * MIMEタイプがテキスト系かどうかを判定する。
 * Content-Type ヘッダーの値（パラメータ付き可）を受け付ける。
 *
 * @param contentType - 判定するMIMEタイプ文字列
 * @returns テキスト系MIMEなら true
 */
export function isTextMime(contentType: string): boolean {
	const base = contentType.split(";")[0].trim().toLowerCase();
	return TEXT_MIME_PREFIXES.some((prefix) => base.startsWith(prefix));
}
