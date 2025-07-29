
// Checagem de conteúdo com Moderation API
export default async function handler(req, res) {
  const { input } = req.body;
  const api_key = process.env.OPENAI_API_KEY;

  try {
    const moderationRes = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input })
    });

    const result = await moderationRes.json();
    res.status(200).json(result.results[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro na moderação: " + err.message });
  }
}
