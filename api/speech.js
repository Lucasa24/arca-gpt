const { fetch } = require("undici");

module.exports = async function handler(req, res) {
  try {
    const { input, voice = "alloy", format = "mp3" } = req.body || {};
    const api_key = process.env.OPENAI_API_KEY;
    if (!api_key) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "OPENAI_API_KEY ausente" }));
    }
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
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}
