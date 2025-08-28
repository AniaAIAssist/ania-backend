export default async function handler(req, res) {
  return res.status(200).json({
    urlTail: (process.env.SUPABASE_URL || '').slice(-6),
    roleTail: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').slice(-6),
  });
}
