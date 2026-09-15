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
});
