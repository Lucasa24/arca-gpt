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

    // 2. Enviar mensagem
    await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
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

    // 3. Iniciar execução
    const runRes = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({
        assistant_id,
        stream: true
      })
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    const reader = runRes.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");

      for (let line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.replace("data: ", "");
          if (data === "[DONE]") {
            res.write("event: done\ndata: [DONE]\n\n");
            res.end();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) {
              res.write(`data: ${delta}\n\n`);
            }
          } catch (e) {
            console.error("Erro ao parsear chunk:", e);
          }
        }
      }
    }

    res.end();
  } catch (err) {
    console.error("ERRO:", err);
    res.write(`data: Erro: ${err.message}\n\n`);
    res.end();
  }
}
