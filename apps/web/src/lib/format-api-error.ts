import { ApiError } from "@/api/client";

export function formatApiError(e: unknown): string {
  if (e instanceof ApiError) {
    return e.detail ? `${e.title}: ${e.detail}` : e.title;
  }
  return e instanceof Error ? e.message : String(e);
}

export function isConflictError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409;
}
