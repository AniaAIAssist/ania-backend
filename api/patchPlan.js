// api/patchPlan.js
const { createClient } = require("@supabase/supabase-js");

// simple CORS helper so you can call this from Base44 front-end
function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
function getJsonBody(req) {
  try {
    return typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  withCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // Trim to avoid hidden whitespace issues
  const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
  const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      ok: false,
      reason: "Missing environment variables",
      hasUrl: !!SUPABASE_URL,
      hasKey: !!SUPABASE_SERVICE_ROLE_KEY,
      env: process.env.VERCEL_ENV
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const { op, payload } = getJsonBody(req);

  const json = (code, obj) => res.status(code).json(obj);
  const must = (cond, msg="Bad Request") => { if (!cond) { throw new Error(msg); } };

  try {
    if (!op) return json(400, { error: "Missing 'op'" });
    if (op === "ping") return json(200, { ok: true, msg: "Connected!" });

    // All ops require your app to send currentUserId
    must(payload && payload.currentUserId, "Missing currentUserId");

   if (op === "start_plan") {
  const { currentUserId, plan_type, state_json } = payload;
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
    plan_id: plan.plan_id,
    version: plan.version,
    summary: plan.summary,
    data: plan.data
  });

  return json(200, {
    plan_id: plan.plan_id,
    plan_type: plan.plan_type,
    version: plan.version,
    summary: plan.summary,
    data: plan.data,
    updated_at: plan.updated_at
  });
}
    if (op === "get_plan") {
      const { plan_id, currentUserId } = payload;
      must(plan_id, "Missing plan_id");

      const { data: plan, error } = await supabase
        .from("user_active_plan")
        .select("*")
        .eq("plan_id", plan_id)
        .single();
      if (error) throw error;
      if (!plan || plan.owner_id !== currentUserId) return json(404, { error: "Not found" });

      return json(200, {
        plan_id: plan.plan_id,
        plan_type: plan.plan_type,
        version: plan.version,
        summary: plan.summary,
        data: plan.data,
        updated_at: plan.updated_at
      });
    }

    if (op === "patch_plan") {
      const { plan_id, expected_version, new_state_json, currentUserId } = payload;
      must(plan_id != null, "Missing plan_id");
      must(expected_version != null, "Missing expected_version");
      must(new_state_json && typeof new_state_json === "object", "Missing new_state_json");

      const { data: current, error: e1 } = await supabase
        .from("user_active_plan")
        .select("*")
        .eq("plan_id", plan_id)
        .single();
      if (e1) throw e1;
      if (!current || current.owner_id !== currentUserId) return json(404, { error: "Not found" });

      if (current.version !== expected_version) {
        return json(409, { error: "VERSION_CONFLICT", current_version: current.version });
      }

      const nextVersion = current.version + 1;

      const { data: updated, error: e2 } = await supabase
        .from("user_active_plan")
        .update({
          version: nextVersion,
          summary: (new_state_json.summary || "").slice(0, 800),
          data: new_state_json.data || current.data,
          updated_at: new Date().toISOString()
        })
        .eq("plan_id", plan_id)
        .select()
        .single();
      if (e2) throw e2;

      await supabase.from("plan_history").insert({
        plan_id,
        version: nextVersion,
        summary: updated.summary,
        data: updated.data
      });

      return json(200, {
        plan_id: updated.plan_id,
        plan_type: updated.plan_type,
        version: updated.version,
        summary: updated.summary,
        data: updated.data,
        updated_at: updated.updated_at
      });
    }

    if (op === "rollback_plan") {
      const { plan_id, target_version, currentUserId } = payload;
      must(plan_id, "Missing plan_id");
      must(target_version != null, "Missing target_version");

      const { data: current, error: e1 } = await supabase
        .from("user_active_plan").select("*").eq("plan_id", plan_id).single();
      if (e1) throw e1;
      if (!current || current.owner_id !== currentUserId) return json(404, { error: "Not found" });

      const { data: snap, error: e2 } = await supabase
        .from("plan_history")
        .select("data, summary")
        .eq("plan_id", plan_id)
        .eq("version", target_version)
        .single();
      if (e2) throw e2;
      if (!snap) return json(404, { error: "SNAPSHOT_NOT_FOUND" });

      const nextVersion = current.version + 1;

      const { data: updated, error: e3 } = await supabase
        .from("user_active_plan")
        .update({
          version: nextVersion,
          summary: snap.summary,
          data: snap.data,
          updated_at: new Date().toISOString()
        })
        .eq("plan_id", plan_id)
        .select()
        .single();
      if (e3) throw e3;

      await supabase.from("plan_history").insert({
        plan_id,
        version: nextVersion,
        summary: updated.summary,
        data: updated.data
      });

      return json(200, {
        plan_id: updated.plan_id,
        plan_type: updated.plan_type,
        version: updated.version,
        summary: updated.summary,
        data: updated.data,
        updated_at: updated.updated_at
      });
    }

    return json(400, { error: "UNKNOWN_OP" });

  } catch (err) {
    return json(500, { error: String(err.message || err) });
  }
};
