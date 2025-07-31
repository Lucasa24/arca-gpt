export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const userInput = req.body.input;
  const api_key = process.env.OPENAI_API_KEY;
  const assistant_id = process.env.ASSISTANT_ID;

  try {
    // 1. Criar thread
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

    // 2. Enviar mensagem
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

    // 3. Rodar execução
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

    // 4. Aguardar resposta completa
    let status = run.status;
    let result;

    while (status === "queued" || status === "in_progress") {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${run.id}`, {
        headers: {
          Authorization: `Bearer ${api_key}`,
          "OpenAI-Beta": "assistants=v2"
        }
      });

      result = await statusRes.json();
      status = result.status;
    }

    // 5. Obter a resposta final
    const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        Authorization: `Bearer ${api_key}`,
        "OpenAI-Beta": "assistants=v2"
      }
    });

    const messagesData = await messagesRes.json();
    const finalMessage = messagesData.data?.[0]?.content?.[0]?.text?.value || "⚠️ A Arca silenciou...";

    res.status(200).json({ reply: finalMessage });
  } catch (err) {
    console.error("ERRO:", err);
    res.status(500).json({ error: "Erro na invocação: " + err.message });
  }
}
