import { test } from "node:test";
import assert from "node:assert/strict";
import { changedItemIds, getItems, login, StremioError } from "../src/lib/stremio.ts";

function fakeFetch(responses: Record<string, unknown>, calls: { method: string; body: unknown }[] = []): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const method = String(url).split("/").pop()!;
    calls.push({ method, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(responses[method]), { status: 200 });
  }) as typeof fetch;
}

test("changedItemIds keeps only items newer than the cursor", async () => {
  const f = fakeFetch({ datastoreMeta: { result: [["tt21285562", 1795349387563], ["tt0084516", 1698776640548]] } });
  assert.deepEqual(await changedItemIds("k", 1795340000000, f), ["tt21285562"]);
});

test("getItems sends ids and skips the call when there are none", async () => {
  const calls: { method: string; body: unknown }[] = [];
  const f = fakeFetch({ datastoreGet: { result: [{ _id: "tt1", name: "X", type: "movie", state: {} }] } }, calls);
  assert.equal((await getItems("k", ["tt1"], f)).length, 1);
  assert.deepEqual(calls[0].body, { authKey: "k", collection: "libraryItem", ids: ["tt1"], all: false });
  assert.deepEqual(await getItems("k", [], f), []);
  assert.equal(calls.length, 1);
});

test("a dead session is an auth error", async () => {
  const f = fakeFetch({ datastoreMeta: { error: { code: 1, message: "Session does not exist" } } });
  await assert.rejects(changedItemIds("bad", 0, f), (e: unknown) => e instanceof StremioError && e.isAuth);
});

test("login returns the auth key", async () => {
  const f = fakeFetch({ login: { result: { authKey: "abc", user: {} } } });
  assert.equal(await login("a@b.c", "pw", f), "abc");
});

test("dead session with a non-2xx status is still an auth error", async () => {
  const f = (async () => new Response(JSON.stringify({ error: { code: 1, message: "Session does not exist" } }), { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(changedItemIds("bad", 0, f), (e: unknown) => e instanceof StremioError && e.isAuth);
});

test("network failure and non-JSON body become StremioError", async () => {
  const boom = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
  await assert.rejects(changedItemIds("k", 0, boom), (e: unknown) => e instanceof StremioError && !e.isAuth);
  const html = (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
  await assert.rejects(changedItemIds("k", 0, html), (e: unknown) => e instanceof StremioError && /502/.test((e as Error).message));
});
