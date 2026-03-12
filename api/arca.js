const { getThreadMessages, addMessageToThread, setThreadPersona, composeAssistantContent, generateClosing } = require('../lib/memory.js');
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
    const t0 = Date.now();
    console.log('[ARCA] threadId=%s persona=%s', req.body?.threadId, process.env.ARCA_PERSONA || '(unset)');
    
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: "Método não permitido" }));
    }

    const userInput = req.body?.userInput || req.body?.input;
    const threadId = req.body?.threadId;
    const userId = req.body?.userId; // ID do usuário logado (email ou uuid)
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

    // [NOVO] Atualiza a persona com base no modo enviado pelo frontend
    // Isso garante que se o usuário clicar no botão "Ritual", o backend saiba.
    const mode = req.body?.mode; // ritual | tecnico
    if (mode && (mode === 'ritual' || mode === 'tecnico')) {
      console.log(`[ARCA] Atualizando persona para: ${mode}`);
      await setThreadPersona(threadId, mode);
    }

    // >>> A PARTIR DAQUI é SSE <<<
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();
    res.write(`: ping\n\n`);
    console.log('[ARCA][TTFT] sse_open_ms=%d', Date.now() - t0);

    // (opcional) ping keepalive
    const keepalive = setInterval(() => res.write(`: ping\n\n`), 15000);

    await addMessageToThread(threadId, "user", userInput, userId);
    const messages = await getThreadMessages(threadId);
    
    // Log das mensagens de sistema para verificação
    const systemMessages = messages.filter(m => m.role==='system');
    console.log('[ARCA][systems] Total:', systemMessages.length);
    systemMessages.forEach((msg, i) => {
      console.log(`[ARCA][system-${i+1}]`, msg.content.slice(0,80) + '...');
    });
    
    // Log da persona atual para esta thread
    const threadRecord = global.threadMemory?.get(threadId);
    console.log('[ARCA][persona]', threadRecord?.currentPersona || 'default');

    // MODELO PADRÃO: GPT-4o (Inteligência Máxima)
    // Decisão estratégica: Como temos poucos usuários, priorizamos a QUALIDADE ABSOLUTA.
    // O custo é maior, mas a experiência é incomparável.
    const userModel = "gpt-4o";
    
    // --- MIGRAÇÃO PARA RESPONSES API (BETA) ---
    // Cole o ID do seu prompt aqui (começa com pmpt_)
    // [OPCIONAL] Se configurado, usa a Responses API (Prompt Management)
    // Se nulo, usa o modo MANUAL (Chat Completions) que é estável e segue apenas o memory.js
    const PROMPT_ID = process.env.ARCA_PROMPT_ID || null; 

    let endpoint = "https://api.openai.com/v1/responses";
    let requestBody;

    // Definição global da injeção para usar em ambos os casos
    const systemInjection = { 
      role: "system", 
      content: "DIRETRIZ DE EXTENSÃO: Resposta com densidade ajustada à complexidade. NÃO GERE FECHAMENTO/DESPEDIDA NO FINAL (o sistema fará isso). Pare após o ultimato." 
    };

    if (PROMPT_ID) {
      // MODO PROMPT GERENCIADO (PROMPT MANAGEMENT API)
      // Correção: Ao usar prompt.id, NÃO devemos enviar model, temperature, etc.
      // O Prompt ID já encapsula toda a configuração.
      
      // CRÍTICO: NÃO filtramos mensagens de sistema. Enviamos TUDO para garantir
      // que as regras locais de "resposta longa" (memory.js) sejam respeitadas.
      
      const conversationHistory = [...messages, systemInjection];
      
      requestBody = {
        prompt: {
          id: PROMPT_ID
        },
        input: conversationHistory, // Responses API usa 'input' para o histórico
        stream: true
      };
      console.log(`[ARCA] Usando Prompt ID: ${PROMPT_ID} (Configurações da UI ativas + Regras Locais)`);
    } else {
      // MODO MANUAL (Antigo)
      endpoint = "https://api.openai.com/v1/chat/completions";
      requestBody = {
        model: userModel,
        messages: [...messages, systemInjection], // INJEÇÃO AQUI TAMBÉM!
        stream: true,
        temperature: 0.85,
        max_tokens: 16000,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.3
      };
      console.log(`[ARCA] MODO MANUAL ATIVO (Prompt ID ignorado/nulo). Injeção de regras aplicada.`);
    }

    console.log(`[ARCA] Iniciando requisição para OpenAI...`);
    const tOpenAI = Date.now();
    let ttftLogged = false;

    let finalRes;
    try {
      finalRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${api_key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
    } catch (err) {
      console.error("[ARCA] ERRO FATAL no fetch inicial:", err);
      res.write(`data: ${JSON.stringify({ content: `⚠️ Erro de Conexão: ${err.message}` })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      return res.end();
    }
    console.log('[ARCA][TTFT] openai_headers_ms=%d', Date.now() - tOpenAI);

    // Fallback para Chat Completions se falhar (404, 400, etc)
    if (!finalRes.ok) {
      console.warn(`[ARCA] Responses API falhou (${finalRes.status}). Fallback para Chat Completions.`);
      
      try {
        const errorBody = await finalRes.text();
        console.warn(`[ARCA] Erro Responses API:`, errorBody);
      } catch (e) { /* ignore */ }

      endpoint = "https://api.openai.com/v1/chat/completions";
      
      // INJEÇÃO NO FALLBACK TAMBÉM!
      // Se Responses API falhar, garantimos que o fallback TAMBÉM tenha a instrução de "sem fechamento".
      const systemInjectionFallback = { 
        role: "system", 
        content: "DIRETRIZ DE EMERGÊNCIA: Resposta com densidade ajustada. NÃO GERE FECHAMENTO. Pare após o ultimato." 
      };
      
      requestBody = {
        model: userModel,
        messages: [...messages, systemInjectionFallback], // Adiciona a injeção aqui também
        stream: true,
        temperature: 0.85,
        max_tokens: 16000,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.3,
        stream_options: { include_usage: false }
      };
      
      console.log(`[ARCA] Iniciando Fallback (Chat Completions)...`);
      try {
        finalRes = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${api_key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody)
        });
      } catch (err2) {
        console.error("[ARCA] ERRO FATAL no fetch de Fallback:", err2);
        res.write(`data: ${JSON.stringify({ content: `⚠️ Erro de Conexão no Fallback: ${err2.message}` })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        return res.end();
      }
    }

    if (!finalRes.ok) {
      clearInterval(keepalive);
      res.statusCode = finalRes.status;
      res.write(`data: ${JSON.stringify({ content: `⚠️ OpenAI Error: ${finalRes.status} ${finalRes.statusText}` })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      return res.end();
    }

    const reader = finalRes.body.getReader();
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
            res.write(`data: ${JSON.stringify({ content: closing })}\n\n`);
            assistantResponse += closing;
          }
          
          // Salva resposta completa com abertura + corpo + fechamento
          addMessageToThread(threadId, "assistant", assistantResponse);
          
          res.write(`data: [DONE]\n\n`);
          clearInterval(keepalive);
          return res.end();
        }
        try {
          const parsed = JSON.parse(payload);
          let chunk = "";
          
          // 1. Tenta extrair do formato RESPONSES API
          if (parsed.type === 'response.output_text.delta') {
             // Garante que pega o texto seja ele string direta ou objeto com value
             chunk = (typeof parsed.delta === 'string') ? parsed.delta : (parsed.delta?.value || "");
          }
          // 2. Tenta extrair do formato CHAT COMPLETIONS (Legacy)
          else if (parsed.choices?.[0]?.delta?.content) {
             chunk = parsed.choices[0].delta.content;
          }

          if (chunk) {
            if (!ttftLogged) {
              ttftLogged = true;
              console.log('[ARCA][TTFT] first_token_ms=%d', Date.now() - tOpenAI);
            }
            // Envia abertura na primeira chunk válida (apenas para persona ritual)
            if (!openingSent) {
              // Verifica a persona atual para esta thread
              const threadRecord = global.threadMemory?.get(threadId);
              const currentPersona = threadRecord?.currentPersona || process.env.ARCA_PERSONA || 'ritual';
              
              if (currentPersona !== "tecnico") {
                const { pickOpening } = require('../lib/memory.js');
                // Simula uma abertura aleatória para a primeira chunk
                const opening = pickOpening(null);
                res.write(`data: ${JSON.stringify({ content: opening })}\n\n`);
                // Adiciona abertura ao buffer da resposta para salvar depois
                assistantResponse += `_${opening}_\n\n`;
              }
              openingSent = true;
            }
            
            assistantResponse += chunk;
            // Envia como JSON para preservar quebras de linha e caracteres especiais
            res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
          }
        } catch { /* ignora pings/linhas quebradas */ }
      }
    }

    // GERAÇÃO DE FECHAMENTO E SALVAMENTO (CRÍTICO PARA MEMÓRIA)
    const closingThreadRecord = global.threadMemory?.get(threadId);
    const closingPersona = closingThreadRecord?.currentPersona || process.env.ARCA_PERSONA || 'ritual';
    
    if (closingPersona !== "tecnico") {
        const { generateClosing } = require('../lib/memory.js');
        const closing = `\n\n${generateClosing()}`;
        
        // Envia fechamento para o cliente
        res.write(`data: ${JSON.stringify({ content: closing })}\n\n`);
        
        // Adiciona ao buffer para salvar
        assistantResponse += closing;
    }

    // SALVA NO HISTÓRICO (Fundamental para o modelo lembrar do que disse)
    if (assistantResponse && assistantResponse.trim()) {
        await addMessageToThread(threadId, "assistant", assistantResponse, userId);
        console.log(`[ARCA] Resposta salva na thread ${threadId} (len: ${assistantResponse.length})`);
    }

    clearInterval(keepalive);
    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (err) {
    try {
      res.write(`data: ${JSON.stringify({ content: `⚠️ A Arca silenciou: ${err.message}` })}\n\n`);
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

