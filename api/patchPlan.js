// api/patchPlan.js
// Works on Vercel even if the project is CommonJS: we import supabase-js v2 dynamically in the handler.

function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
function getJsonBody(req) {
  try { return typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); }
  catch { return {}; }
}
function json(res, code, obj) { return res.status(code).json(obj); }
function must(cond, msg="Bad Request") { if (!cond) { const e = new Error(msg); e.status = 400; throw e; } }

module.exports = async (req, res) => {
  withCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return json(res, 200, { ok:true, endpoint:"/api/patchPlan", use:"POST with {op,...}" });
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // ✅ dynamic import to support ESM-only supabase-js v2
  const { createClient } = await import("@supabase/supabase-js");

  const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
  const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, {
      ok:false, reason:"Missing environment variables",
      hasUrl: !!SUPABASE_URL, hasKey: !!SUPABASE_SERVICE_ROLE_KEY, env: process.env.VERCEL_ENV
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { op, payload } = getJsonBody(req);

  try {
    if (!op) return json(res, 400, { error: "Missing 'op'" });
    if (op === "ping") return json(res, 200, { ok:true, msg:"Connected!" });

    // ---------- single-active-per-type core ops ----------
    if (op === "start_plan") {
      const { currentUserId, plan_type, state_json } = payload || {};
      must(currentUserId, "Missing currentUserId");
      must(plan_type, "Missing plan_type");
      must(state_json && typeof state_json === "object", "Missing state_json");

      const up = {
        owner_id: currentUserId,
        plan_type,
        version: state_json.version ?? 1,
        summary: state_json.summary ?? "",
        data: state_json.data ?? {},
        updated_at: new Date().toISOString()
      };

      const { data: plan, error } = await supabase
        .from("user_active_plan")
        .upsert(up, { onConflict: "owner_id,plan_type" })
        .select()
        .single();
      if (error) throw error;

      await supabase.from("plan_history").insert({
        plan_id: plan.plan_id, version: plan.version, summary: plan.summary, data: plan.data
      });

      return json(res, 200, {
        plan_id: plan.plan_id, plan_type: plan.plan_type, version: plan.version,
        summary: plan.summary, data: plan.data, updated_at: plan.updated_at
      });
    }

    if (op === "get_active_plan") {
      const { currentUserId, plan_type } = payload || {};
      must(currentUserId, "Missing currentUserId");
      must(plan_type, "Missing plan_type");
      const { data: plan, error } = await supabase
        .from("user_active_plan")
        .select("*")
        .eq("owner_id", currentUserId)
        .eq("plan_type", plan_type)
        .maybeSingle();
      if (error) throw error;
      if (!plan) return json(res, 404, { error: "NOT_FOUND" });
      return json(res, 200, {
        plan_id: plan.plan_id, plan_type: plan.plan_type, version: plan.version,
        summary: plan.summary, data: plan.data, updated_at: plan.updated_at
      });
    }

    if (op === "patch_active_plan") {
      const { currentUserId, plan_type, expected_version, new_state_json } = payload || {};
      must(currentUserId, "Missing currentUserId");
      must(plan_type, "Missing plan_type");
      must(expected_version != null, "Missing expected_version");
      must(new_state_json && typeof new_state_json === "object", "Missing new_state_json");

      const { data: current, error: e1 } = await supabase
        .from("user_active_plan")
        .select("*")
        .eq("owner_id", currentUserId)
        .eq("plan_type", plan_type)
        .single();
      if (e1) throw e1;

      if (current.version !== expected_version)
        return json(res, 409, { error:"VERSION_CONFLICT", current_version: current.version });

      const nextVersion = current.version + 1;
      const { data: updated, error: e2 } = await supabase
        .from("user_active_plan")
        .update({
          version: nextVersion,
          summary: (new_state_json.summary || "").slice(0,800),
          data: new_state_json.data || current.data,
          updated_at: new Date().toISOString()
        })
        .eq("plan_id", current.plan_id)
        .select()
        .single();
      if (e2) throw e2;

      await supabase.from("plan_history").insert({
        plan_id: current.plan_id, version: nextVersion, summary: updated.summary, data: updated.data
      });

      return json(res, 200, {
        plan_id: updated.plan_id, plan_type: updated.plan_type, version: updated.version,
        summary: updated.summary, data: updated.data, updated_at: updated.updated_at
      });
    }

    // (Optional legacy ops by id could also be here…)

    return json(res, 400, { error: "UNKNOWN_OP" });

  } catch (err) {
    const code = err.status || 500;
    return json(res, code, { error: String(err.message || err) });
  }
};
