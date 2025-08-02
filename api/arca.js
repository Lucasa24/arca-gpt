export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  // Configurar cabeçalhos para streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const userInput = req.body.input;

  if (!userInput || userInput.trim() === "") {
    return res.status(400).json({ error: "Nada foi invocado." });
  }

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
    let finalMessage = "⚠️ A Arca silenciou...";

    if (messagesData?.data?.length > 0) {
      const firstMsg = messagesData.data[0];
      const firstContent = firstMsg.content?.find(c => c.type === "text");
      if (firstContent?.text?.value) {
        finalMessage = firstContent.text.value;
        
        // Enviar a resposta em pequenos pedaços para simular streaming
        const chunks = finalMessage.split(/(?<=\s+)/g); // Divide mantendo espaços no final
        
        for (const chunk of chunks) {
          if (chunk) {
            const delta = chunk;
            // Aplicar a correção solicitada para normalizar espaços, mantendo quebras e markdown
            const safe = delta.replace(/[^\S\r\n]+/g, " "); // mantém quebras, markdown e emojis
            res.write(`data: ${safe}\n\n`);
            await new Promise(resolve => setTimeout(resolve, 25)); // aumenta levemente a cadência
          }
        }
        
        res.write(`data: [DONE]\n\n`);
        res.end();
        return;
      }
    }
    
    // Se não houver mensagem, enviar resposta padrão
    res.write(`data: ${finalMessage}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    console.error("ERRO:", err);
    res.status(500).json({ error: "Erro na invocação: " + err.message });
  }
}
