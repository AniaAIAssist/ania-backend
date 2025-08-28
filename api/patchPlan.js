import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const { op, payload } = req.body || {};

  try {
    if (op === "ping") {
      return res.status(200).json({ ok: true, msg: "Connected!" });
    }

    return res.status(400).json({ error: "Unknown op" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
