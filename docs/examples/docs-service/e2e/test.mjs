const url = process.env.API_URL ?? process.env.FRONTEND_URL;
if (!url) throw new Error("Expected API_URL or FRONTEND_URL");
const response = await fetch(url + "/health");
if (!response.ok) throw new Error(`Health request failed: ${response.status}`);
