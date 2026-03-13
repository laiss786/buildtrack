// functions/index.js — BuildTrack AI Proxy
// Proxies requests to Anthropic API server-side to avoid CORS.
// Deploy with: firebase deploy --only functions

const functions = require("firebase-functions");
const fetch     = (...args) => import("node-fetch").then(({default: f}) => f(...args));

const ANTHROPIC_API_KEY = "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";

exports.claudeProxy = functions.https.onRequest(async (req, res) => {
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
