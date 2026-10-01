import { describe, expect, it } from "vitest";

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;

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

describe("Example Backend E2E Tests", () => {
  it("verifies server is healthy and responds to /health", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const res = await fetch(`${API_URL}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string; environment: string };
    expect(body.status).toBe("healthy");
  });

  it("verifies /api/hello response", async () => {
    const res = await fetch(`${API_URL}/api/hello`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("Hello from Solid Stack example backend!");
  });
});
