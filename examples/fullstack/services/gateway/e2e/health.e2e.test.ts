import { describe, expect, it } from "vitest";

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;

async function waitForServer(url: string, retries = 30, delayMs = 1000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch {
      // Gateway not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

describe("Gateway Service E2E Tests (Local Isolation with Mocks)", () => {
  it("verifies gateway health endpoint responds", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const res = await fetch(`${API_URL}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string; service: string; source: string };
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("gateway");
    expect(body.source).toBe("actual-gateway");
  });

  it("proxies /api/ calls to mock-backend", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const res = await fetch(`${API_URL}/api/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.service).toBe("backend");
    // Local test verifies proxying hits mock backend!
    expect(body.source).toBe("mock-backend");
  });

  it("proxies / calls to mock-frontend", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const res = await fetch(`${API_URL}/`);
    expect(res.status).toBe(200);

    const text = await res.text();
    // Local test verifies proxying hits mock frontend!
    expect(text).toContain("mock-frontend");
  });
});
