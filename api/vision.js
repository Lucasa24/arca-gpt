// api/vision.js — HTTP nativo + REST direto (sem SDK)
const { fetch } = require("undici");

module.exports = async function handler(req, res) {
  try {
    const { prompt, imageB64, mime = "image/png" } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "OPENAI_API_KEY ausente" }));
    }
    if (!imageB64) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "imageB64 ausente" }));
    }

    // Aceita tanto base64 cru quanto dataURL completo
    const dataUrl = imageB64.startsWith("data:")
      ? imageB64
      : `data:${mime};base64,${imageB64}`;

    const body = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt || "Analise a imagem e dê um diagnóstico executável." },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ]
    };

    const oaRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const json = await oaRes.json().catch(() => null);

    if (!oaRes.ok) {
      console.error("Vision OpenAI error:", oaRes.status, json);
      res.writeHead(oaRes.status, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        error: json?.error?.message || `OpenAI ${oaRes.status}`
      }));
    }

    const text = json?.choices?.[0]?.message?.content || "(sem conteúdo)";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ text }));
  } catch (e) {
    console.error("Vision 500 fatal:", e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e?.message || "Erro desconhecido" }));
  }
};
