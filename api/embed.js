
// Geração de embeddings
export default async function handler(req, res) {
  const { input } = req.body;
  const api_key = process.env.OPENAI_API_KEY;

  try {
    const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input, model: "text-embedding-ada-002" })
    });

    const embed = await embedRes.json();
    res.status(200).json(embed.data[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao gerar embedding: " + err.message });
  }
}
