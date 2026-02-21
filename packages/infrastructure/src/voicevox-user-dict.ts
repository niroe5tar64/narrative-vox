import { normalizeVoicevoxApiUrl } from "./voicevox-engine.ts";

export interface UserDictWordEntry {
  surface: string;
  pronunciation: string;
  accent_type?: number;
  word_type?: string;
  priority?: number;
}

export interface EngineUserDictEntry {
  surface: string;
  pronunciation: string;
  accent_type: number;
  word_type: string;
  priority: number;
  mora_count: number;
}

export type EngineUserDict = Record<string, EngineUserDictEntry>;

export async function fetchUserDict(apiUrl: string): Promise<EngineUserDict> {
  const url = `${normalizeVoicevoxApiUrl(apiUrl)}/user_dict`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`GET /user_dict failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as EngineUserDict;
}

export async function deleteUserDictWord(apiUrl: string, uuid: string): Promise<void> {
  const url = `${normalizeVoicevoxApiUrl(apiUrl)}/user_dict_word/${encodeURIComponent(uuid)}`;
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(
      `DELETE /user_dict_word/${uuid} failed: ${response.status} ${response.statusText}`
    );
  }
}

export async function addUserDictWord(
  apiUrl: string,
  word: UserDictWordEntry
): Promise<string> {
  const base = normalizeVoicevoxApiUrl(apiUrl);
  const endpoint = new URL("/user_dict_word", base);
  endpoint.searchParams.set("surface", word.surface);
  endpoint.searchParams.set("pronunciation", word.pronunciation);
  endpoint.searchParams.set("accent_type", String(word.accent_type ?? 0));
  if (word.word_type) {
    endpoint.searchParams.set("word_type", word.word_type);
  }
  if (word.priority !== undefined) {
    endpoint.searchParams.set("priority", String(word.priority));
  }

  const response = await fetch(endpoint, { method: "POST" });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `POST /user_dict_word failed for "${word.surface}": ${response.status} ${response.statusText} ${body}`
    );
  }
  return (await response.json()) as string;
}
