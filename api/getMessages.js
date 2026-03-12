const { getThreadMessages } = require('../lib/memory.js');

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
    const messages = getThreadMessages(threadId);
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
