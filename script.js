export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const userInput = req.body.input;
  const assistant_id = process.env.ASSISTANT_ID;
  const api_key = process.env.OPENAI_API_KEY;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

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

    // 2. Enviar mensagem
    await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({ role: "user", content: userInput })
    });

    // 3. Rodar com streaming habilitado
    const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({ assistant_id, stream: true })
    });

    // 4. Ler resposta token a token
    const reader = runRes.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Extrair texto seguro do buffer e enviar ao client
      const chunks = buffer.split("\n\n");
      for (let chunk of chunks) {
        if (chunk.startsWith("data: ")) {
          const json = chunk.replace("data: ", "");
          if (json === "[DONE]") {
            res.write("event: done\ndata: [DONE]\n\n");
            res.end();
            return;
          }

          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              res.write(`data: ${delta}\n\n`);
            }
          } catch (e) {}
        }
      }
    }

    res.end();
  } catch (err) {
    res.write(`data: Erro: ${err.message}\n\n`);
    res.end();
  }
}
