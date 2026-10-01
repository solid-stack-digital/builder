import express from "express";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3004);

interface MockEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
}

const sentEmails: MockEmail[] = [];

// Healthcheck
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    service: "mailer",
    source: "actual-mailer",
  });
});

// Service metadata
app.get("/api/info", (_req, res) => {
  res.json({
    service: "mailer",
    source: "actual-mailer",
    type: "mock-mailing-service",
  });
});

// Send mock email
app.post("/send", (req, res) => {
  const { to, subject, body } = req.body;
  if (!to || !subject) {
    return res.status(400).json({ error: "Missing 'to' or 'subject'" });
  }

  const emailId = `mail-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const emailRecord: MockEmail = {
    id: emailId,
    to,
    subject,
    body: body || "",
    sentAt: new Date().toISOString(),
  };

  sentEmails.push(emailRecord);
  console.log(`📧 [mailer] Mock email dispatched to: ${to} (Subject: ${subject})`);

  return res.status(200).json({
    source: "actual-mailer",
    status: "sent",
    id: emailId,
    to,
  });
});

// Retrieve sent emails
app.get("/emails", (_req, res) => {
  return res.json({
    source: "actual-mailer",
    total: sentEmails.length,
    emails: sentEmails,
  });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Mailer service listening on port ${PORT}`);
  });
}

export { app };
