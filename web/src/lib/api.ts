/** Minimal JSON API client. Errors carry the server's Polish message. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public body: any) {
    super(message);
  }
}

export type SessionListener = (reason: "expired" | "passwordChange") => void;
let sessionListener: SessionListener | null = null;
export const onSessionEvent = (fn: SessionListener) => (sessionListener = fn);

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) {
    if (body?.expired) sessionListener?.("expired");
    if (body?.passwordChangeRequired) sessionListener?.("passwordChange");
    throw new ApiError(res.status, body?.error ?? `Błąd ${res.status}`, body);
  }
  return body as T;
}

export const get = <T = any>(path: string) => api<T>(path);
export const post = <T = any>(path: string, json?: unknown) => api<T>(path, { method: "POST", json: json ?? {} });
export const put = <T = any>(path: string, json: unknown) => api<T>(path, { method: "PUT", json });
export const del = <T = any>(path: string) => api<T>(path, { method: "DELETE" });
