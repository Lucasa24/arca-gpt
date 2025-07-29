export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const userInput = req.body.input;
  const assistant_id = process.env.ASSISTANT_ID;
  const api_key = process.env.OPENAI_API_KEY;

  try {
    // 1. Criar Thread
    const threadRes = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      }
    });
    const thread = await threadRes.json();
    const threadId = thread.id;

    // 2. Enviar mensagem do usuário
    await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({
        role: "user",
        content: userInput
      })
    });

    // 3. Rodar o Assistant
    const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({
        assistant_id
      })
    });
    const run = await runRes.json();

    // 4. Esperar execução
    let status = "queued";
    let result;
    while (status === "queued" || status === "in_progress") {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const statusRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${run.id}`, {
        headers: {
          Authorization: `Bearer ${api_key}`,
          "OpenAI-Beta": "assistants=v2"
        }
      });
      result = await statusRes.json();
      status = result.status;
    }

    // 5. Buscar mensagens
    const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        Authorization: `Bearer ${api_key}`,
        "OpenAI-Beta": "assistants=v2"
      }
    });

    const messagesData = await messagesRes.json();
    const finalMessage = messagesData.data?.[0]?.content?.[0]?.text?.value;

    res.status(200).json({ reply: finalMessage || "Sem resposta ritual." });
  } catch (error) {
    res.status(500).json({ error: "Erro ao invocar a Arca: " + error.message });
  }
}
