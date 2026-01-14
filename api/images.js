const { fetch } = require("undici");

module.exports = async function handler(req, res) {
  try {
    const { prompt, size = "512x512" } = req.body || {};
    const api_key = process.env.OPENAI_API_KEY;
    if (!api_key) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "OPENAI_API_KEY ausente" }));
    }
    if (!prompt || !prompt.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Prompt ausente" }));
    }
    const oaRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size, response_format: "b64_json" })
    });
    const json = await oaRes.json();
    const b64 = json?.data?.[0]?.b64_json || null;
    if (!b64) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Falha na geração de imagem" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ image_b64: b64 }));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}
