// api/envEcho.js
module.exports = (req, res) => {
  const urlTail = (process.env.SUPABASE_URL || "").trim().slice(-6);
  const roleTail = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim().slice(-6);
  const env = process.env.VERCEL_ENV; // "production" | "preview" | "development"
  res.status(200).json({ urlTail, roleTail, env });
};
