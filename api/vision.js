// api/vision.js — CommonJS + HTTP nativo
const OpenAI = require("openai");

// 🔐 Verificação de segurança no boot
console.log('🔑 OPENAI_API_KEY configurada (vision):', !!process.env.OPENAI_API_KEY);
if (!process.env.OPENAI_API_KEY) {
  console.warn('⚠️ OPENAI_API_KEY não encontrada! Configure no .env ou Vercel.');
}

module.exports = async function handler(req, res) {
  try {
    console.log('[VISION] Recebendo requisição:', req.method);
    
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Método não permitido' }));
    }

    const { prompt, imageB64, mime = "image/png" } = req.body || {};
    const api_key = process.env.OPENAI_API_KEY;
    
    if (!prompt || !imageB64) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Prompt e imageB64 são obrigatórios' }));
    }
    
    if (!api_key) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'OPENAI_API_KEY ausente' }));
    }

    // aceita tanto base64 cru quanto dataURL já pronto
    const dataUrl = imageB64.startsWith("data:")
      ? imageB64
      : `data:${mime};base64,${imageB64}`;

    const client = new OpenAI({ apiKey: api_key });
    
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
