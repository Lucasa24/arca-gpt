const { createClient } = require('@supabase/supabase-js');

function getSupabase(authHeader) {
  const url = process.env.SUPABASE_URL;
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.SUPABASE_KEY;
  if (!url) return null;
  if (sr) return createClient(url, sr);
  if (anon && authHeader) return createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const authHeader = req.headers['authorization'];
  const supabase = getSupabase(authHeader);
  if (!supabase) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'JWT ausente (Authorization) ou Supabase não configurado' }));
  }

  try {
    const body = req.body || {};
    const { threadId, archived, userId, title } = body;
    const hasArchived = typeof archived === 'boolean';
    const hasTitle = typeof title === 'string' && title.trim();
    if (!threadId || (!hasArchived && !hasTitle)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'threadId e ao menos um campo (archived/title) são obrigatórios' }));
    }

    let { data, error } = await supabase
      .from('threads')
      .select('data, user_id')
      .eq('id', threadId)
      .single();
    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!data) {
      const { getThreadMessages } = require('../lib/memory.js');
      await getThreadMessages(threadId, authHeader);
      const r2 = await supabase.from('threads').select('data, user_id').eq('id', threadId).single();
      if (r2.error && r2.error.code !== 'PGRST116') throw r2.error;
      data = r2.data || { data: {}, user_id: null };
    }

    const rec = data.data || {};
    const meta = rec.meta || {};
    if (hasArchived) meta.archived = archived;
    if (hasTitle) meta.title = String(title).trim().slice(0, 120);
    if (!meta.created_at) meta.created_at = new Date().toISOString();
    rec.meta = meta;

    const payload = {
      id: threadId,
      data: rec,
      updated_at: new Date().toISOString()
    };
    if (userId) payload.user_id = userId;

    const up = await supabase.from('threads').upsert(payload);
    if (up.error) {
      throw new Error(up.error.message);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, meta }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Erro ao atualizar sessão: ' + (err && err.message ? err.message : String(err)) }));
  }
};

