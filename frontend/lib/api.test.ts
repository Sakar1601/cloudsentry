import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { connectStream, getActions, getGraph, resolveAction } from "./api";
import { AuthRequiredError, getToken, setToken } from "./auth";

function respond(status: number, body: unknown = {}) {
  return vi.fn(async () => ({ status, ok: status < 400, json: async () => body }) as Response);
}

describe("api with an operator token", () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("sends plain requests when no token is stored", async () => {
    global.fetch = respond(200, { nodes: {}, edges: [] });

    await getGraph();

    expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/graph");
  });

  it("attaches the stored token as a bearer header", async () => {
    setToken("  abc123  ");
    global.fetch = respond(200, []);

    await getActions();

    expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/actions", {
      headers: { Authorization: "Bearer abc123" },
    });
  });

  it("keeps the POST method and adds the token when approving", async () => {
    setToken("abc123");
    global.fetch = respond(200);

    await resolveAction("a1", "approve");

    expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/actions/a1/approve", {
      method: "POST",
      headers: { Authorization: "Bearer abc123" },
    });
  });

  it("treats a 401 as 'a token is needed' and forgets the rejected token", async () => {
    setToken("wrong");
    global.fetch = respond(401);

    await expect(getActions()).rejects.toBeInstanceOf(AuthRequiredError);
    expect(getToken()).toBeNull();
  });

  it("passes the token to the WebSocket as a query parameter", () => {
    setToken("a b&c");
    const urls: string[] = [];
    class FakeSocket {
      constructor(url: string) {
        urls.push(url);
      }
      addEventListener() {}
      close() {}
    }
    // @ts-expect-error test double for the global WebSocket
    global.WebSocket = FakeSocket;

    connectStream(() => {});

    expect(urls[0]).toBe("ws://localhost:8000/graph/stream?token=a%20b%26c");
  });
});
