import { describe, expect, it } from "vitest";

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3004}`;

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

describe("Mailer Service E2E Tests", () => {
  it("verifies server is healthy and identifies as actual-mailer", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const res = await fetch(`${API_URL}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string; service: string; source: string };
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("mailer");
    expect(body.source).toBe("actual-mailer");
  });

  it("sends a mock email and retrieves emails list", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const sendRes = await fetch(`${API_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "john@example.com",
        subject: "Welcome to Solid Stack",
        body: "Your account is created.",
      }),
    });
    expect(sendRes.status).toBe(200);
    const sendData = (await sendRes.json()) as any;
    expect(sendData.source).toBe("actual-mailer");
    expect(sendData.status).toBe("sent");
    expect(sendData.to).toBe("john@example.com");

    const getRes = await fetch(`${API_URL}/emails`);
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as any;
    expect(getData.source).toBe("actual-mailer");
    expect(getData.total).toBeGreaterThanOrEqual(1);
  });
});
