const { fetch } = require("undici");

module.exports = async function handler(req, res) {
  const { input } = req.body;
  const api_key = process.env.OPENAI_API_KEY;

  try {
    const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input, model: "text-embedding-3-small" })
    });

    const embed = await embedRes.json();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(embed.data?.[0] || embed));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Erro ao gerar embedding: " + err.message }));
  }
}
