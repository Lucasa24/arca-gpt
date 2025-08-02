export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const api_key = process.env.OPENAI_API_KEY;

  try {
    const response = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      }
    });

    const thread = await response.json();
    res.status(200).json({ threadId: thread.id });
  } catch (err) {
    console.error("Erro ao criar thread:", err);
    res.status(500).json({ error: "Falha ao criar thread" });
  }
}