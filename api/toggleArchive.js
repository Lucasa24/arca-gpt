const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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

  const supabase = getSupabase();
  if (!supabase) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Supabase não configurado' }));
  }

  try {
    const body = req.body || {};
    const { threadId, archived, userId } = body;
    if (!threadId || typeof archived !== 'boolean') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'threadId e archived são obrigatórios' }));
    }

    const { data, error } = await supabase
      .from('threads')
      .select('data, user_id')
      .eq('id', threadId)
      .single();
    if (error || !data) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Thread não encontrada' }));
    }

    const rec = data.data || {};
    const meta = rec.meta || {};
    meta.archived = archived;
    rec.meta = meta;

    const payload = {
      id: threadId,
      data: rec,
      updated_at: new Date().toISOString()
    };
    if (userId && !data.user_id) payload.user_id = userId;

    const up = await supabase.from('threads').upsert(payload);
    if (up.error) {
      throw new Error(up.error.message);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Erro ao arquivar: ' + (err && err.message ? err.message : String(err)) }));
  }
};

