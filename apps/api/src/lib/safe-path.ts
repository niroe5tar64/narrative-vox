import { realpath } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { config } from "../config.ts";

/** セーフパス検証エラーのエラーコード。 */
export type SafePathErrorCode = "PATH_TRAVERSAL" | "SYMLINK_ESCAPE";

/** パストラバーサルまたはシンボリックリンク逸脱を検出した場合のエラー。 */
export class SafePathError extends Error {
	constructor(
		message: string,
		public readonly code: SafePathErrorCode,
	) {
		super(message);
		this.name = "SafePathError";
	}
}

function isWithinRoot(absPath: string, root: string): boolean {
	const normalizedRoot = root.endsWith("/") ? root : `${root}/`;
	return absPath === root || absPath.startsWith(normalizedRoot);
}

/**
 * 入力パスをリポジトリルート内の安全な絶対パスに解決する。
 *
 * - パストラバーサル（`../` など）を拒否する
 * - シンボリックリンクがリポジトリルート外を指す場合は拒否する
 * - 対象ファイルが存在しない場合は親ディレクトリで検証する
 *
 * @param inputPath - 検証する相対パスまたは絶対パス
 * @returns リポジトリルート内に収まる絶対パス
 * @throws {SafePathError} パストラバーサルまたはシンボリックリンク逸脱を検出した場合
 */
export async function safeResolve(inputPath: string): Promise<string> {
	const resolved = resolve(config.repoRoot, inputPath);

	if (!isWithinRoot(resolved, config.repoRoot)) {
		throw new SafePathError(
			`Path escapes repository root: ${inputPath}`,
			"PATH_TRAVERSAL",
		);
	}

	try {
		const real = await realpath(resolved);
		if (!isWithinRoot(real, config.repoRoot)) {
			throw new SafePathError(
				`Symlink escapes repository root: ${inputPath}`,
				"SYMLINK_ESCAPE",
			);
		}
		return real;
	} catch (e) {
		if (e instanceof SafePathError) throw e;
		// ファイルが存在しない場合は親ディレクトリで検証する
		const parentReal = await realpath(dirname(resolved)).catch(() => {
			throw new SafePathError(
				`Parent directory not found: ${inputPath}`,
				"PATH_TRAVERSAL",
			);
		});
		if (!isWithinRoot(parentReal, config.repoRoot)) {
			throw new SafePathError(
				`Symlink escapes repository root: ${inputPath}`,
				"SYMLINK_ESCAPE",
			);
		}
		return `${parentReal}/${basename(resolved)}`;
	}
}
