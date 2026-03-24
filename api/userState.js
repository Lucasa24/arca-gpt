const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient(authHeader) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_KEY;
  if (!url || !anon) return null;
  if (!authHeader) return null;
  return createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
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
  const supabase = getSupabaseClient(authHeader);
  if (!supabase) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'JWT ausente (Authorization) ou Supabase não configurado' }));
  }

  const body = req.body || {};
  const action = body.action || 'get';
  const userId = body.userId;
  if (!userId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'userId ausente' }));
  }

  try {
    if (action === 'get') {
      const { data, error } = await supabase
        .from('user_state')
        .select('user_id, last_thread_id, last_scroll, updated_at')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ state: data || null }));
    }

    if (action === 'set') {
      const payload = {
        user_id: userId,
        updated_at: new Date().toISOString()
      };
      if (typeof body.lastThreadId === 'string' && body.lastThreadId) {
        payload.last_thread_id = body.lastThreadId;
      }
      if (body.lastScroll && typeof body.lastScroll === 'object') {
        payload.last_scroll = body.lastScroll;
      }

      const { error } = await supabase.from('user_state').upsert(payload);
      if (error) throw error;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'action inválida' }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Erro em userState: ' + (err && err.message ? err.message : String(err)) }));
  }
};
