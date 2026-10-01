import { describe, expect, it } from "vitest";

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3002}`;

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

describe("Backend Service E2E Tests (Local Isolation with Mocks)", () => {
  it("verifies server is healthy and identifies as actual-backend", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const res = await fetch(`${API_URL}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string; service: string; source: string };
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("backend");
    expect(body.source).toBe("actual-backend");
  });

  it("verifies local service is using MOCK dependencies", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const res = await fetch(`${API_URL}/api/dependencies`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.source).toBe("actual-backend");

    // Must be using the local mocks!
    expect(body.filesystem.source).toBe("mock-filesystem");
    expect(body.mailer.source).toBe("mock-mailer");
    expect(body.database.status).toBe("connected");
  });

  it("executes upload and notify flow with mock dependencies", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const res = await fetch(`${API_URL}/api/upload-and-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "invoice.pdf",
        content: "Invoice contents...",
        recipient: "accounting@example.com",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.filesystem.source).toBe("mock-filesystem");
    expect(body.mailer.source).toBe("mock-mailer");
  });
});
