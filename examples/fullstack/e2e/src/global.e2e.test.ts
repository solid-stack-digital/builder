import { describe, expect, it } from "vitest";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:3000";

async function waitForServer(url: string, retries = 40, delayMs = 1500): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch {
      // Service still initializing
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

describe("Global Fullstack Mesh E2E Integration Suite", () => {
  it("verifies gateway is healthy and wraps frontend and backend", async () => {
    const isReady = await waitForServer(GATEWAY_URL);
    expect(isReady).toBe(true);

    // 1. Direct gateway health
    const gwRes = await fetch(`${GATEWAY_URL}/health`);
    expect(gwRes.status).toBe(200);
    const gwBody = (await gwRes.json()) as any;
    expect(gwBody.service).toBe("gateway");
    expect(gwBody.source).toBe("actual-gateway");

    // 2. Gateway wraps backend via /api/health
    const apiRes = await fetch(`${GATEWAY_URL}/api/health`);
    expect(apiRes.status).toBe(200);
    const apiBody = (await apiRes.json()) as any;
    expect(apiBody.service).toBe("backend");
    expect(apiBody.source).toBe("actual-backend");

    // 3. Gateway wraps frontend via /
    const frontRes = await fetch(`${GATEWAY_URL}/`);
    expect(frontRes.status).toBe(200);
    const html = await frontRes.text();
    expect(html).toContain("actual-frontend");
  });

  it("verifies backend uses the root-provided filesystem and mailer (NOT mocks)", async () => {
    const isReady = await waitForServer(GATEWAY_URL);
    expect(isReady).toBe(true);

    const depRes = await fetch(`${GATEWAY_URL}/api/dependencies`);
    expect(depRes.status).toBe(200);

    const depBody = (await depRes.json()) as any;
    expect(depBody.source).toBe("actual-backend");

    // On global test, backend MUST use provided dependencies on the root!
    expect(depBody.filesystem.source).toBe("actual-filesystem");
    expect(depBody.mailer.source).toBe("actual-mailer");

    // Backend database must be connected to its own Firebase emulator
    expect(depBody.database.status).toBe("connected");
    expect(depBody.database.type).toBe("firebase");
  });

  it("verifies frontend uses the root-provided backend (NOT mock)", async () => {
    const isReady = await waitForServer(GATEWAY_URL);
    expect(isReady).toBe(true);

    const fbRes = await fetch(`${GATEWAY_URL}/frontend-backend-status`);
    expect(fbRes.status).toBe(200);

    const fbBody = (await fbRes.json()) as any;
    expect(fbBody.source).toBe("actual-frontend");

    // On global test, frontend MUST connect to actual backend!
    expect(fbBody.backend.source).toBe("actual-backend");

    // Also verify rendered React HTML
    const frontRes = await fetch(`${GATEWAY_URL}/`);
    expect(frontRes.status).toBe(200);
    const html = await frontRes.text();
    expect(html).toContain("actual-backend");
  });

  it("executes complete inter-service flow: Gateway -> Backend -> Filesystem (Firebase) + Database (Firebase) + Mailer", async () => {
    const isReady = await waitForServer(GATEWAY_URL);
    expect(isReady).toBe(true);

    const filename = `contract-${Date.now()}.pdf`;
    const content = "Confidential contractual terms and conditions.";
    const recipient = "client@example.com";

    // Trigger complete workflow through Gateway
    const uploadRes = await fetch(`${GATEWAY_URL}/api/upload-and-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content, recipient }),
    });

    expect(uploadRes.status).toBe(200);
    const uploadBody = (await uploadRes.json()) as any;
    expect(uploadBody.success).toBe(true);

    // Verify Filesystem used was the actual service and returned a valid fileId
    expect(uploadBody.filesystem.source).toBe("actual-filesystem");
    expect(uploadBody.filesystem.status).toBe("saved");
    const fileId = uploadBody.filesystem.fileId;
    expect(fileId).toBeDefined();

    // Verify Mailer used was the actual service
    expect(uploadBody.mailer.source).toBe("actual-mailer");
    expect(uploadBody.mailer.status).toBe("sent");

    // Verify stored file can be retrieved back through the Gateway
    const retrieveRes = await fetch(`${GATEWAY_URL}/api/files/${fileId}`);
    expect(retrieveRes.status).toBe(200);
    const retrieveBody = (await retrieveRes.json()) as any;
    expect(retrieveBody.source).toBe("actual-filesystem");
    expect(retrieveBody.filename).toBe(filename);
    expect(retrieveBody.content).toBe(content);
  });
});
