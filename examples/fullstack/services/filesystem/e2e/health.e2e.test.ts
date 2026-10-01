import { describe, expect, it } from "vitest";

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3003}`;

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

describe("Filesystem Service E2E Tests", () => {
  it("verifies server is healthy and identifies as actual-filesystem", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const res = await fetch(`${API_URL}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string; service: string; source: string };
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("filesystem");
    expect(body.source).toBe("actual-filesystem");
  });

  it("stores a file and retrieves it", async () => {
    const isReady = await waitForServer(API_URL);
    expect(isReady).toBe(true);

    const uploadRes = await fetch(`${API_URL}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "test-doc.txt",
        content: "Hello from isolated filesystem test!",
      }),
    });
    expect(uploadRes.status).toBe(201);
    const uploadData = (await uploadRes.json()) as any;
    expect(uploadData.source).toBe("actual-filesystem");
    expect(uploadData.status).toBe("saved");
    expect(uploadData.fileId).toBeDefined();

    const getRes = await fetch(`${API_URL}/files/${uploadData.fileId}`);
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as any;
    expect(getData.source).toBe("actual-filesystem");
    expect(getData.filename).toBe("test-doc.txt");
    expect(getData.content).toBe("Hello from isolated filesystem test!");
  });
});
