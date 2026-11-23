// Client for the undocumented Stremio account API (api.strem.io), as used by Stremio Web.
// Shapes checked against live responses on 2026-11-22: datastoreMeta -> [[id, mtimeMs]], bad key -> {error:{code:1}}.

import type { LibraryItem } from "./presence.ts";

const API = "https://api.strem.io/api/";

export class StremioError extends Error {
  readonly code: number | null;
  constructor(message: string, code: number | null) {
    super(message);
    this.code = code;
  }
  // Code 1 = "Session does not exist": the auth key is dead; the user must link again.
  get isAuth() {
    return this.code === 1;
  }
}

type FetchFn = typeof fetch;

async function call<T>(method: string, body: object, f: FetchFn): Promise<T> {
  let res: Response;
  let json: { result?: T; error?: { message?: string; code?: number } } | null = null;
  try {
    res = await f(API + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    json = await res.json().catch(() => null);
  } catch (e) {
    throw new StremioError(`${method}: ${e instanceof Error ? e.message : "request failed"}`, null);
  }
  // Read the error body before the status: a dead key may come with a non-2xx code.
  if (json?.error) throw new StremioError(`${method}: ${json.error.message ?? "error"}`, json.error.code ?? null);
  if (!res.ok || !json) throw new StremioError(`${method}: HTTP ${res.status}`, null);
  if (json.result === undefined) throw new StremioError(`${method}: empty result`, null);
  return json.result;
}

export async function login(email: string, password: string, f: FetchFn = fetch): Promise<string> {
  const r = await call<{ authKey?: string }>("login", { type: "Login", email, password, facebook: false }, f);
  if (!r.authKey) throw new StremioError("login: no auth key", null);
  return r.authKey;
}

// Ids of library items changed after `sinceMs`.
export async function changedItemIds(authKey: string, sinceMs: number, f: FetchFn = fetch): Promise<string[]> {
  const meta = await call<[string, number][]>("datastoreMeta", { authKey, collection: "libraryItem" }, f);
  return meta.filter(([, mtime]) => mtime > sinceMs).map(([id]) => id);
}

export async function getItems(authKey: string, ids: string[], f: FetchFn = fetch): Promise<LibraryItem[]> {
  if (ids.length === 0) return [];
  return call<LibraryItem[]>("datastoreGet", { authKey, collection: "libraryItem", ids, all: false }, f);
}
