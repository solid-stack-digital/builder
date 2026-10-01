import express from "express";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3003);
const FIREBASE_URL = process.env.FIREBASE_URL || "http://firebase:8080";
const GCP_PROJECT = process.env.GCP_PROJECT || "demo-fullstack";

interface StoredFile {
  fileId: string;
  filename: string;
  content: string;
  createdAt: string;
}

const memoryFiles = new Map<string, StoredFile>();

// Healthcheck
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    service: "filesystem",
    source: "actual-filesystem",
  });
});

// Service metadata
app.get("/api/info", (_req, res) => {
  res.json({
    service: "filesystem",
    source: "actual-filesystem",
    storage: "firebase-emulator",
    firebaseUrl: FIREBASE_URL,
  });
});

// Store file in Firebase emulator & memory
app.post("/files", async (req, res) => {
  const { filename, content } = req.body;
  if (!filename || content === undefined) {
    return res.status(400).json({ error: "Missing filename or content" });
  }

  const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const record: StoredFile = {
    fileId,
    filename,
    content,
    createdAt: new Date().toISOString(),
  };

  memoryFiles.set(fileId, record);

  // Write to Firebase Firestore emulator
  try {
    const firestoreUrl = `${FIREBASE_URL}/v1/projects/${GCP_PROJECT}/databases/(default)/documents/files?documentId=${fileId}`;
    await fetch(firestoreUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          fileId: { stringValue: fileId },
          filename: { stringValue: filename },
          content: { stringValue: String(content) },
          createdAt: { timestampValue: record.createdAt },
        },
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err: any) {
    console.warn(`[filesystem] Note: Firebase emulator write warning: ${err?.message || err}`);
  }

  return res.status(201).json({
    source: "actual-filesystem",
    status: "saved",
    fileId,
    filename,
  });
});

// Retrieve file
app.get("/files/:id", async (req, res) => {
  const fileId = req.params.id;

  // First check in-memory
  const cached = memoryFiles.get(fileId);
  if (cached) {
    return res.json({
      source: "actual-filesystem",
      ...cached,
    });
  }

  // Try fetching from Firebase emulator
  try {
    const firestoreUrl = `${FIREBASE_URL}/v1/projects/${GCP_PROJECT}/databases/(default)/documents/files/${fileId}`;
    const fbRes = await fetch(firestoreUrl, { signal: AbortSignal.timeout(3000) });
    if (fbRes.ok) {
      const data = (await fbRes.json()) as any;
      const filename = data.fields?.filename?.stringValue || "unknown";
      const content = data.fields?.content?.stringValue || "";
      return res.json({
        source: "actual-filesystem",
        fileId,
        filename,
        content,
      });
    }
  } catch (err: any) {
    console.warn(`[filesystem] Note: Firebase emulator fetch error: ${err?.message || err}`);
  }

  return res.status(404).json({ error: "File not found" });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Filesystem service listening on port ${PORT}`);
  });
}

export { app };
