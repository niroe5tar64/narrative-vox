import { describe, expect, test } from "vitest";

import { ApiError } from "@/api/client";
import { formatApiError, isConflictError } from "@/lib/format-api-error";

describe("formatApiError", () => {
  test("ApiError with detail", () => {
    expect(formatApiError(new ApiError(400, "Bad", "detail"))).toBe(
      "Bad: detail",
    );
  });

  test("ApiError without detail", () => {
    expect(formatApiError(new ApiError(500, "ISE"))).toBe("ISE");
  });

  test("Error", () => {
    expect(formatApiError(new Error("msg"))).toBe("msg");
  });

  test("plain string", () => {
    expect(formatApiError("plain string")).toBe("plain string");
  });

  test("null", () => {
    expect(formatApiError(null)).toBe("null");
  });
});

describe("isConflictError", () => {
  test("409 ApiError", () => {
    expect(isConflictError(new ApiError(409, "Conflict"))).toBe(true);
  });

  test("non-409 ApiError", () => {
    expect(isConflictError(new ApiError(400, "Bad"))).toBe(false);
  });

  test("non ApiError", () => {
    expect(isConflictError(new Error("other"))).toBe(false);
  });
});
