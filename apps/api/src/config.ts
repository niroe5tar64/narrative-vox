import { resolve } from "node:path";
import { normalizeVoicevoxBaseUrl } from "./lib/voicevox-url.ts";

const rawVoicevoxUrl = process.env.VOICEVOX_URL ?? "http://localhost:50021";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  /** CORSで許可するオリジン。未設定時は Web 開発サーバーを許可する。 */
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173",
  /** セーフパス検証の起点となるリポジトリルート。 */
  repoRoot: process.env.REPO_ROOT
    ? resolve(process.env.REPO_ROOT)
    : resolve(process.cwd()),
  /** VOICEVOX EngineのベースURL。 */
  voicevoxUrl: normalizeVoicevoxBaseUrl(rawVoicevoxUrl),
};
