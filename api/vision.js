// api/vision.js — CommonJS + HTTP nativo
const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = async function handler(req, res) {
  try {
    const { prompt, imageB64, mime = "image/png" } = req.body || {};

    if (!imageB64) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "imageB64 ausente" }));
    }

    // aceita tanto base64 cru quanto dataURL já pronto
    const dataUrl = imageB64.startsWith("data:")
      ? imageB64
      : `data:${mime};base64,${imageB64}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt || "Analise a imagem e dê um diagnóstico executável." },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      // opcional, ajuda a evitar respostas vazias
      max_tokens: 400
    });

    const text = completion?.choices?.[0]?.message?.content ?? "(sem conteúdo)";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ text }));
  } catch (e) {
    console.error("Vision 500:", e?.response?.data || e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e?.message || "Erro desconhecido" }));
  }
};
