import express, { type Express } from "express";

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "healthy",
      environment: process.env.ENVIRONMENT || "development",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/hello", (_req, res) => {
    res.json({ message: "Hello from Solid Stack example backend!" });
  });

  return app;
}

const PORT = Number(process.env.PORT) || 3000;

if (process.env.NODE_ENV !== "test") {
  const app = createApp();
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Example backend server listening on port ${PORT}`);
  });

  const shutdown = () => {
    console.log("Shutting down server...");
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
