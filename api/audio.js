const { fetch } = require("undici");

async function handleSpeech(req, res, api_key) {
  const { input, voice = "alloy", format = "mp3" } = req.body || {};
  if (!input || !input.trim()) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Texto ausente" }));
  }
  const oaRes = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", input, voice, format })
  });
  const buf = Buffer.from(await oaRes.arrayBuffer());
  const b64 = buf.toString("base64");
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ audio_b64: b64, format }));
}

async function handleTranscribe(req, res, api_key) {
  const { audioUrl, audioB64, mime = "audio/mpeg" } = req.body || {};
  let blob;
  if (audioUrl) {
    const r = await fetch(audioUrl);
    const ab = await r.arrayBuffer();
    blob = new Blob([ab], { type: mime });
  } else if (audioB64) {
    const buf = Buffer.from(audioB64, "base64");
    blob = new Blob([buf], { type: mime });
  } else {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Áudio ausente" }));
  }
  const form = new FormData();
  form.append("file", blob, "audio.mp3");
  form.append("model", "whisper-1");
  const oaRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${api_key}` },
    body: form
  });
  const json = await oaRes.json();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ text: json.text || "" }));
}

module.exports = async function handler(req, res) {
  try {
    const api_key = process.env.OPENAI_API_KEY;
    if (!api_key) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "OPENAI_API_KEY ausente" }));
    }

    const action = req.body?.action;
    
    // Fallback para rotas antigas se necessário via server.js, 
    // mas aqui decidimos pela ação no body
    if (action === 'transcribe' || req.url?.includes('transcribe')) {
      return await handleTranscribe(req, res, api_key);
    } else {
      // Padrão é speech (voz)
      return await handleSpeech(req, res, api_key);
    }
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}
