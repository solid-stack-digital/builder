import express from "express";
import React from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App.js";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3001);
const BACKEND_URL = process.env.BACKEND_URL || "http://backend:3002";

// Healthcheck
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    service: "frontend",
    source: "actual-frontend",
  });
});

const getBackendStatus = async (_req: express.Request, res: express.Response) => {
  let backendData: any = { source: "unreachable", status: "unknown" };
  try {
    const bRes = await fetch(`${BACKEND_URL}/api/dependencies`, { signal: AbortSignal.timeout(3000) });
    if (bRes.ok) {
      backendData = await bRes.json();
    }
  } catch (err: any) {
    try {
      const bRes = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(3000) });
      if (bRes.ok) {
        backendData = await bRes.json();
      }
    } catch {
      console.warn(`[frontend] Backend unreachable at ${BACKEND_URL}`);
    }
  }

  return res.json({
    service: "frontend",
    source: "actual-frontend",
    backend: backendData,
  });
};

app.get("/api/backend-status", getBackendStatus);
app.get("/frontend-backend-status", getBackendStatus);

// SSR React page
const renderPage = async (_req: express.Request, res: express.Response) => {
  let backendSource = "unknown";
  let backendStatus = "disconnected";

  try {
    const bRes = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (bRes.ok) {
      const data = (await bRes.json()) as any;
      backendSource = data.source || "mock-backend";
      backendStatus = data.status || "healthy";
    }
  } catch {
    // If backend not reachable during render
  }

  const appHtml = renderToString(
    React.createElement(App, {
      frontendSource: "actual-frontend",
      backendSource,
      backendStatus,
    })
  );

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solid Stack Fullstack</title>
</head>
<body>
  <div id="root">${appHtml}</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(fullHtml);
};

app.get("/", renderPage);
app.get("/web", renderPage);

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Frontend service listening on port ${PORT}`);
  });
}

export { app };
