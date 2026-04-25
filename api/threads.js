const { createClient } = require("@supabase/supabase-js");

function getSupabase(authHeader) {
  const url = process.env.SUPABASE_URL;
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.SUPABASE_KEY;
  if (!url) return null;
  if (sr) return createClient(url, sr);
  if (anon && authHeader) return createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  return null;
}

function deriveTitleFromRecord(record) {
  const metaTitle = record && record.meta && record.meta.title;
  if (metaTitle) return String(metaTitle);
  const msgs = record && Array.isArray(record.messages) ? record.messages : [];
  const firstUser = msgs.find((m) => m && m.role === "user" && typeof m.content === "string" && m.content.trim());
  const raw = firstUser ? firstUser.content.trim() : "Travessia";
  return raw.slice(0, 60) + (raw.length > 60 ? "..." : "");
}

function deriveCreatedAt(row) {
  const rec = row && row.data ? row.data : {};
  const metaCreated = rec && rec.meta && rec.meta.created_at;
  if (metaCreated) return metaCreated;
  const id = row && row.id ? String(row.id) : "";
  const m = id.match(/^thread_(\d{10,})_/);
  if (m && m[1]) {
    const ms = Number(m[1]);
    if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  }
  return row && row.updated_at ? row.updated_at : new Date(0).toISOString();
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    return res.end();
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const authHeader = req.headers["authorization"];
  const supabase = getSupabase(authHeader);
  if (!supabase) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "JWT ausente (Authorization) ou Supabase não configurado" }));
  }

  try {
    const body = req.body || {};

    const threadId = body.threadId;
    const hasArchived = typeof body.archived === "boolean";
    const hasTitle = typeof body.title === "string" && body.title.trim();

    if (threadId && (hasArchived || hasTitle)) {
      const userId = body.userId;
      let { data, error } = await supabase.from("threads").select("data, user_id").eq("id", threadId).single();
      if (error && error.code !== "PGRST116") throw error;

      if (!data) {
        const { getThreadMessages } = require("../lib/memory.js");
        await getThreadMessages(threadId, authHeader);
        const r2 = await supabase.from("threads").select("data, user_id").eq("id", threadId).single();
        if (r2.error && r2.error.code !== "PGRST116") throw r2.error;
        data = r2.data || { data: {}, user_id: null };
      }

      const rec = data.data || {};
      const meta = rec.meta || {};
      if (hasArchived) meta.archived = body.archived;
      if (hasTitle) meta.title = String(body.title).trim().slice(0, 120);
      if (!meta.created_at) meta.created_at = new Date().toISOString();
      rec.meta = meta;

      const payload = { id: threadId, data: rec, updated_at: new Date().toISOString() };
      if (userId) payload.user_id = userId;

      const up = await supabase.from("threads").upsert(payload);
      if (up.error) throw new Error(up.error.message);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, meta }));
    }

    const userId = body.userId;
    if (!userId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "userId ausente" }));
    }

    const { data, error } = await supabase.from("threads").select("id, data, updated_at, user_id").eq("user_id", userId);
    if (error) throw error;

    const threads = (data || [])
      .map((row) => {
        const rec = row.data || {};
        const title = deriveTitleFromRecord(rec);
        const archived = !!(rec && rec.meta && rec.meta.archived);
        const ts = deriveCreatedAt(row);
        return { id: row.id, title, archived, timestamp: ts };
      })
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ threads }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Erro em threads: " + (err && err.message ? err.message : String(err)) }));
  }
};

