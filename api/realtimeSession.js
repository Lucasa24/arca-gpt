const { fetch } = require('undici');

module.exports = async function handler(req, res) {
  try {
    const api_key = process.env.OPENAI_API_KEY;
    if (!api_key) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'OPENAI_API_KEY ausente' }));
    }

    const body = req.body || {};
    const model = String(body.model || process.env.ARCA_REALTIME_MODEL || 'gpt-4o-realtime-preview');
    const voice = String(body.voice || process.env.ARCA_REALTIME_VOICE || 'alloy');

    const oaRes = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, voice })
    });

    const json = await oaRes.json().catch(() => ({}));
    if (!oaRes.ok) {
      const msg =
        (json && json.error && (json.error.message || json.error)) ||
        `Falha ao criar sessão Realtime (${oaRes.status})`;
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: msg }));
    }

    const clientSecret = json && json.client_secret && json.client_secret.value;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      client_secret: clientSecret,
      model,
      voice,
      expires_at: json && json.client_secret && json.client_secret.expires_at
    }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}
