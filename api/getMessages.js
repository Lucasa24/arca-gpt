const { getThreadMessages } = require('../lib/memory.js');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end();
  }

  let body = req.body;
  if (!body) {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString('utf8');
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  }
  const { threadId } = body || {};
  if (!threadId) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "threadId ausente" }));
  }

  try {
    const authHeader = req.headers['authorization'];
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_KEY;
    if (!authHeader || !supabaseUrl || !anonKey) {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "JWT ausente (Authorization) ou Supabase não configurado" }));
    }
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data, error } = await supabase
      .from('threads')
      .select('id')
      .eq('id', threadId)
      .single();
    if (error || !data) {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: "Acesso negado à thread solicitada" }));
    }

    const messages = await getThreadMessages(threadId, authHeader, true);
    const userMessages = messages.filter(msg => msg.role !== "system");
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ messages: userMessages }));
  } catch (err) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Erro ao buscar mensagens: " + err.message }));
  }
}
