const { fetch } = require("undici");

module.exports = async function handler(req, res) {
  try {
    const { audioUrl, audioB64, mime = "audio/mpeg" } = req.body || {};
    const api_key = process.env.OPENAI_API_KEY;
    if (!api_key) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "OPENAI_API_KEY ausente" }));
    }
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
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}
