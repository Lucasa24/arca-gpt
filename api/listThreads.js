const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient(authHeader) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_KEY;
  if (!url || !anon) return null;
  if (!authHeader) return null;
  return createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
}

function deriveTitleFromRecord(record) {
  const metaTitle = record && record.meta && record.meta.title;
  if (metaTitle) return String(metaTitle);
  const msgs = (record && Array.isArray(record.messages)) ? record.messages : [];
  const firstUser = msgs.find(m => m && m.role === 'user' && typeof m.content === 'string' && m.content.trim());
  const raw = firstUser ? firstUser.content.trim() : 'Travessia';
  return raw.slice(0, 60) + (raw.length > 60 ? '...' : '');
}

function deriveCreatedAt(row) {
  const rec = row && row.data ? row.data : {};
  const metaCreated = rec && rec.meta && rec.meta.created_at;
  if (metaCreated) return metaCreated;
  const id = row && row.id ? String(row.id) : '';
  const m = id.match(/^thread_(\d{10,})_/);
  if (m && m[1]) {
    const ms = Number(m[1]);
    if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  }
  return row && row.updated_at ? row.updated_at : new Date(0).toISOString();
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
  const userId = body.userId;
  if (!userId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'userId ausente' }));
  }

  try {
    const { data, error } = await supabase
      .from('threads')
      .select('id, data, updated_at, user_id')
      .eq('user_id', userId);

    if (error) throw error;

    const threads = (data || []).map(row => {
      const rec = row.data || {};
      const title = deriveTitleFromRecord(rec);
      const archived = !!(rec && rec.meta && rec.meta.archived);
      const ts = deriveCreatedAt(row);
      return { id: row.id, title, archived, timestamp: ts };
    }).sort((a,b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ threads }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Erro ao listar threads: ' + (err && err.message ? err.message : String(err)) }));
  }
};
