const { getThreadMessages } = require('./memory.js');

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end();
  }

  const { threadId } = req.body || {};

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
