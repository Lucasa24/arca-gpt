export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { threadId } = req.body;

  try {
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2"
      }
    });

    const data = await response.json();

    const parsed = data.data.map(msg => ({
      role: msg.role,
      content: msg.content[0]?.text?.value || ""
    }));

    res.status(200).json({ messages: parsed.reverse() }); // reverse = ordem correta
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar mensagens: " + err.message });
  }
}
