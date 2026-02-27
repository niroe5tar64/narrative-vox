import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "@/api/client";

describe("api client headers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GET request does not attach Content-Type automatically", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.projects.list();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toBeInstanceOf(Headers);
    expect((init.headers as Headers).has("Content-Type")).toBe(false);
  });

  test("POST JSON request attaches Content-Type automatically", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: "narrator" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.characters.update("narrator", {
      key: "narrator",
      name: "Narrator",
      description: "desc",
      voice: { engineId: "e", speakerId: "s", styleId: 1 },
      emotionStyles: {},
      profile: {},
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get("Content-Type")).toBe(
      "application/json",
    );
  });
});
