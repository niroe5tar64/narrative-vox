const ALLOWED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "voicevox",
  "voicevox-engine",
  "narrative-vox-voicevox-engine",
  "host.docker.internal",
]);

export function normalizeVoicevoxBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("VOICEVOX_URL must be a valid URL");
  }

  if (url.protocol !== "http:") {
    throw new Error("VOICEVOX_URL must use http");
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`VOICEVOX_URL host is not allowed: ${url.hostname}`);
  }
  if (url.username || url.password) {
    throw new Error("VOICEVOX_URL must not include credentials");
  }
  if (url.search || url.hash) {
    throw new Error("VOICEVOX_URL must not include query or hash");
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname.length === 0 ? "/" : pathname;
  return url.toString().replace(/\/$/, "");
}

export function isAllowedVoicevoxUrl(raw: string): boolean {
  try {
    normalizeVoicevoxBaseUrl(raw);
    return true;
  } catch {
    return false;
  }
}
