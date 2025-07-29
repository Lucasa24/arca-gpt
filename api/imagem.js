
// Geração de imagem com DALL·E
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { prompt } = req.body;
  const api_key = process.env.OPENAI_API_KEY;

  try {
    const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt, n: 1, size: "512x512" })
    });

    const dalle = await dalleRes.json();
    res.status(200).json({ image: dalle.data?.[0]?.url });
  } catch (err) {
    res.status(500).json({ error: "Erro ao gerar imagem: " + err.message });
  }
}
