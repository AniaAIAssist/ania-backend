// api/patchPlan.js
const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  // Trim in case there are hidden spaces/newlines in env vars
  const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
  const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  // Guard so we don't crash if env vars aren't visible yet
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      ok: false,
      reason: "Missing environment variables",
      hasUrl: !!SUPABASE_URL,
      hasKey: !!SUPABASE_SERVICE_ROLE_KEY,
      env: process.env.VERCEL_ENV // "production" | "preview" | "development"
    });
  }

  // Create the client AFTER confirming envs exist
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const { op } = body;

  if (op === "ping") {
    return res.status(200).json({ ok: true, msg: "Connected!" });
  }

  return res.status(400).json({ error: "Unknown op" });
};
