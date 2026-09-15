export type Scripted = { status: number; body: unknown; headers?: Record<string, string> };

export function fetchStub(script: Scripted[] | ((url: string, init: RequestInit, n: number) => Scripted)) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    calls.push({ url: u, init });
    const s = Array.isArray(script) ? script[Math.min(calls.length - 1, script.length - 1)] : script(u, init, calls.length);
    return new Response(typeof s.body === "string" ? s.body : JSON.stringify(s.body), { status: s.status, headers: { "content-type": "application/json", ...(s.headers ?? {}) } });
  };
  return Object.assign(fn as unknown as typeof fetch, { calls });
}
