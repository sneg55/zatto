import { describe, it, expect, vi, beforeEach } from "vitest";

describe("http context lazy db import", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@opennextjs/cloudflare");
  });

  it("importing lib/http/context does not touch the cloudflare runtime", async () => {
    const getCloudflareContext = vi.fn(() => { throw new Error("cloudflare runtime touched at import time"); });
    vi.doMock("@opennextjs/cloudflare", () => ({ getCloudflareContext }));
    const mod = await import("@/lib/http/context");
    expect(typeof mod.buildContext).toBe("function");
    expect(getCloudflareContext).not.toHaveBeenCalled();
  });

  it("refuses the placeholder PUBLIC_BASE_URL with a message naming the file to edit", async () => {
    const mod = await import("@/lib/http/context");
    expect(() => mod.assertPublicBaseUrl("https://zatto.REPLACE.workers.dev")).toThrow(/wrangler\.jsonc/);
    expect(() => mod.assertPublicBaseUrl("")).toThrow(/PUBLIC_BASE_URL/);
    expect(() => mod.assertPublicBaseUrl(undefined)).toThrow(/PUBLIC_BASE_URL/);
    expect(mod.assertPublicBaseUrl("https://zatto.example.workers.dev")).toBe("https://zatto.example.workers.dev");
  });

  it("binds the service-binding fetch to its receiver so triggerStep reaches it", async () => {
    const mod = await import("@/lib/http/context");
    let called = false;
    const binding = {
      fetch(this: unknown) {
        if (this !== binding) throw new TypeError("Illegal invocation");
        called = true;
        return Promise.resolve(new Response("{}", { status: 200 }));
      },
    };
    const waited: Promise<unknown>[] = [];
    const ctx = {
      env: { PUBLIC_BASE_URL: "https://z.test", INTERNAL_SECRET: "s".repeat(64), WORKER_SELF_REFERENCE: binding },
      fetch: (() => { throw new Error("should not fall back to global fetch"); }) as unknown as typeof fetch,
      waitUntil: (p: Promise<unknown>) => { waited.push(p); },
    } as unknown as import("@/lib/http/context").AppContext;
    expect(() => mod.triggerStep(ctx, "r1")).not.toThrow();
    await Promise.all(waited);
    expect(called).toBe(true);
  });
});
