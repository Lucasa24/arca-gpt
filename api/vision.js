import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    const { prompt, imageB64, mime = "image/png" } = await req.json?.() || req.body;

    const model = "gpt-4o-mini"; // qualidade/latência ótima p/ visão
    const dataUrl = `data:${mime};base64,${imageB64}`;

    const completion = await client.chat.completions.create({
      model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt || "Analise a imagem e dê um diagnóstico executável." },
          { type: "image_url", image_url: { url: dataUrl } }
        ]
      }],
      stream: false
    });

    const text = completion.choices[0].message.content;
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}