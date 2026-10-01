// functions/index.js — BuildTrack AI Proxy
// Proxies requests to Anthropic API server-side to avoid CORS.
// Set the key once with: firebase functions:secrets:set ANTHROPIC_API_KEY
// Deploy with: firebase deploy --only functions

const functions = require("firebase-functions");
const fetch     = (...args) => import("node-fetch").then(({default: f}) => f(...args));

exports.claudeProxy = functions
  .runWith({ secrets: ["ANTHROPIC_API_KEY"] })
  .https.onRequest(async (req, res) => {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;


  // CORS headers — allow only your Firebase domain
  res.set("Access-Control-Allow-Origin", "https://buildtrack001.web.app");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: err.message });
  }
});
