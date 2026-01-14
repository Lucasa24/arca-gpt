const { getThreadMessages, addMessageToThread, composeAssistantContent, generateClosing } = require('./memory.js');
const { fetch } = require('undici');

// arca.js — fora do handler (executa no cold start da função)
if (!global.__ARCA_PERSONA_LOGGED__) {
  console.log('👤 ARCA_PERSONA:', process.env.ARCA_PERSONA || '(unset)');
  global.__ARCA_PERSONA_LOGGED__ = true;
}

// 🔐 Verificação de segurança no boot
console.log('🔑 OPENAI_API_KEY configurada:', !!process.env.OPENAI_API_KEY);
if (!process.env.OPENAI_API_KEY) {
  console.warn('⚠️ OPENAI_API_KEY não encontrada! Configure no .env ou Vercel.');
}

async function handler(req, res) {
  try {
    console.log('[ARCA] threadId=%s persona=%s', req.body?.threadId, process.env.ARCA_PERSONA || '(unset)');
    
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: "Método não permitido" }));
    }

    const userInput = req.body?.userInput || req.body?.input;
    const threadId = req.body?.threadId;
    const api_key = process.env.OPENAI_API_KEY;
    console.log(`[ARCA][DEBUG] userInput: "${userInput}" (length: ${userInput?.length || 0})`);

    if (!userInput || !userInput.trim()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: "Nada foi invocado." }));
    }
    if (!threadId) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: "threadId ausente" }));
    }
    if (!api_key) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: "OPENAI_API_KEY ausente" }));
    }

    // >>> A PARTIR DAQUI é SSE <<<
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    // (opcional) ping keepalive
    const keepalive = setInterval(() => res.write(`: ping\n\n`), 15000);

    addMessageToThread(threadId, "user", userInput);
    const messages = getThreadMessages(threadId);
    
    // Log das mensagens de sistema para verificação
    const systemMessages = messages.filter(m => m.role==='system');
    console.log('[ARCA][systems] Total:', systemMessages.length);
    systemMessages.forEach((msg, i) => {
      console.log(`[ARCA][system-${i+1}]`, msg.content.slice(0,80) + '...');
    });
    
    // Log da persona atual para esta thread
    const threadRecord = global.threadMemory?.get(threadId);
    console.log('[ARCA][persona]', threadRecord?.currentPersona || 'default');

    const oaRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        stream: true,
        temperature: 1.10,
        max_tokens: 4000,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
        stream_options: { include_usage: false }
      })
    });

    if (!oaRes.ok) {
      clearInterval(keepalive);
      res.statusCode = oaRes.status;
      res.write(`data: ⚠️ OpenAI: ${oaRes.status} ${oaRes.statusText}\n\n`);
      res.write(`data: [DONE]\n\n`);
      return res.end();
    }

    const reader = oaRes.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let assistantResponse = "";

    // Primeira chunk: envia abertura variável
    let openingSent = false;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          // Verifica a persona atual para esta thread
          const threadRecord = global.threadMemory?.get(threadId);
          const currentPersona = threadRecord?.currentPersona || process.env.ARCA_PERSONA || 'ritual';
          
          // Adiciona fechamento variável apenas para persona ritual
          if (currentPersona !== "tecnico") {
            const closing = `\n\n${generateClosing()}`;
            res.write(`data: ${closing}\n\n`);
          }
          
          // Salva resposta completa com abertura + corpo + fechamento
          const finalResponse = composeAssistantContent(assistantResponse, threadId);
          addMessageToThread(threadId, "assistant", finalResponse);
          
          res.write(`data: [DONE]\n\n`);
          clearInterval(keepalive);
          return res.end();
        }
        try {
          const parsed = JSON.parse(payload);
          const chunk = parsed.choices?.[0]?.delta?.content || "";
          if (chunk) {
            // Envia abertura na primeira chunk válida (apenas para persona ritual)
            if (!openingSent) {
              // Verifica a persona atual para esta thread
              const threadRecord = global.threadMemory?.get(threadId);
              const currentPersona = threadRecord?.currentPersona || process.env.ARCA_PERSONA || 'ritual';
              
              if (currentPersona !== "tecnico") {
                const { pickOpening } = require('./memory.js');
                // Simula uma abertura aleatória para a primeira chunk
                const opening = pickOpening(null);
                res.write(`data: ${opening}\n\n`);
              }
              openingSent = true;
            }
            
            assistantResponse += chunk;
            res.write(`data: ${chunk}\n\n`);
          }
        } catch { /* ignora pings/linhas quebradas */ }
      }
    }

    clearInterval(keepalive);
    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (err) {
    try {
      res.write(`data: ⚠️ A Arca silenciou: ${err.message}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Falha ao invocar: ${err.message}` }));
    }
  }
}

module.exports = handler;