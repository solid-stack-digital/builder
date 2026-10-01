import { describe, expect, it } from "vitest";

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;

async function waitForServer(url: string, retries = 30, delayMs = 1000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

describe("Frontend Service E2E Tests (Local Isolation with Mocks)", () => {
  it("verifies server is healthy and identifies as actual-frontend", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const res = await fetch(`${API_URL}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string; service: string; source: string };
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("frontend");
    expect(body.source).toBe("actual-frontend");
  });

  it("verifies frontend uses MOCK backend dependency locally", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const res = await fetch(`${API_URL}/api/backend-status`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.source).toBe("actual-frontend");
    // Local test verifies it's using the mock backend!
    expect(body.backend.source).toBe("mock-backend");
  });

  it("renders React HTML containing mock backend reference", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const res = await fetch(`${API_URL}/`);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("actual-frontend");
    expect(html).toContain("mock-backend");
  });
});
