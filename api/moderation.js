const { fetch } = require("undici");

module.exports = async function handler(req, res) {
  const { input } = req.body;
  const api_key = process.env.OPENAI_API_KEY;

  try {
    const moderationRes = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input, model: "omni-moderation-latest" })
    });

    const result = await moderationRes.json();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result.results?.[0] || result));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Erro na moderação: " + err.message }));
  }
}
