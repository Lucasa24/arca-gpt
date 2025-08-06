import { getThreadMessages, addMessageToThread } from './memory.js';

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  // Configurar cabeçalhos para streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const userInput = req.body.input;
  const threadId = req.body.threadId;

  if (!userInput || userInput.trim() === "") {
    return res.status(400).json({ error: "Nada foi invocado." });
  }

  if (!threadId) {
    return res.status(400).json({ error: "threadId ausente" });
  }

  const api_key = process.env.OPENAI_API_KEY;

  try {
    // Adicionar mensagem do usuário à memória da thread
    addMessageToThread(threadId, "user", userInput);
    
    // Obter histórico completo da conversa
    const messages = getThreadMessages(threadId);

    // Fazer chamada para chat/completions com streaming verdadeiro
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    // Processar streaming em tempo real
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let assistantResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim().startsWith("data: ")) {
          const json = line.replace("data: ", "").trim();
          
          if (json === "[DONE]") {
            // Salvar resposta completa na memória
            addMessageToThread(threadId, "assistant", assistantResponse);
            
            res.write(`data: [DONE]\n\n`);
            res.end();
            return;
          }
          
          try {
            const parsed = JSON.parse(json);
            const token = parsed.choices?.[0]?.delta?.content || "";
            
            if (token) {
              assistantResponse += token;
              res.write(`data: ${token}\n\n`);
            }
          } catch {
            // Ignorar linhas de keepalive ou malformadas
          }
        }
      }
    }
    
  } catch (err) {
    console.error("ERRO:", err);
    res.write(`data: ⚠️ A Arca silenciou: ${err.message}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  }
}
