import { resolve } from "node:path";

export const config = {
	port: Number(process.env.PORT ?? 3000),
	host: process.env.HOST ?? "0.0.0.0",
	/** CORSで許可するオリジン。空の場合はCORSヘッダーを付与しない（同一オリジン制約）。 */
	allowedOrigin: process.env.ALLOWED_ORIGIN ?? "",
	/** セーフパス検証の起点となるリポジトリルート。 */
	repoRoot: process.env.REPO_ROOT
		? resolve(process.env.REPO_ROOT)
		: resolve(process.cwd()),
	/** VOICEVOX EngineのベースURL。 */
	voicevoxUrl: process.env.VOICEVOX_URL ?? "http://localhost:50021",
};
