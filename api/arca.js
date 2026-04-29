const { getThreadMessages, addMessageToThread, setThreadPersona, composeAssistantContent, generateClosing, pickOpening } = require('../lib/memory.js');
const { fetch } = require('undici');
const { gerarComCreditos, gerarComCreditosStream } = require('../lib/credits.js');

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

    // [NOVO] Atualiza a persona com base no modo enviado pelo frontend
    // Isso garante que se o usuário clicar no botão "Ritual", o backend saiba.
    const mode = req.body?.mode; // ritual | tecnico
    if (mode && (mode === 'ritual' || mode === 'tecnico')) {
      console.log(`[ARCA] Atualizando persona para: ${mode}`);
      await setThreadPersona(threadId, mode, req.headers['authorization']);
    }

    // >>> A PARTIR DAQUI é SSE <<<
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'none');
    if (res.flushHeaders) res.flushHeaders();
    res.write(`: ping\n\n`);
    console.log('[ARCA][TTFT] sse_open_ms=%d', Date.now() - t0);

    // (opcional) ping keepalive
    const keepalive = setInterval(() => res.write(`: ping\n\n`), 15000);

    await addMessageToThread(threadId, "user", userInput, userId, req.headers['authorization']);
    const messages = await getThreadMessages(threadId, req.headers['authorization']);
    
    // Log das mensagens de sistema para verificação
    const systemMessages = messages.filter(m => m.role==='system');
    console.log('[ARCA][systems] Total:', systemMessages.length);
    systemMessages.forEach((msg, i) => {
      console.log(`[ARCA][system-${i+1}]`, msg.content.slice(0,80) + '...');
    });
    
    // Log da persona atual para esta thread
    const threadRecord = global.threadMemory?.get(threadId);
    console.log('[ARCA][persona]', threadRecord?.currentPersona || 'default');

    const userModel = "gpt-4o";
    
    // --- MIGRAÇÃO PARA RESPONSES API (BETA) ---
    // Cole o ID do seu prompt aqui (começa com pmpt_)
    // [OPCIONAL] Se configurado, usa a Responses API (Prompt Management)
    // Se nulo, usa o modo MANUAL (Chat Completions) que é estável e segue apenas o memory.js
    const PROMPT_ID_DEEP = process.env.ARCA_PROMPT_ID_DEEP || process.env.ARCA_PROMPT_ID || null;
    const modelMode = (req.body?.modelMode || 'auto').toLowerCase();

    let endpoint = "https://api.openai.com/v1/responses";
    let requestBody;

    // Definição global da injeção para usar em ambos os casos
    const systemInjection = { 
      role: "system", 
      content: "DIRETRIZ DE DENSIDADE: Sua resposta deve ter extensão proporcional à complexidade do pedido. Para perguntas simples ou saudações, seja breve (3-5 linhas). Para diagnósticos, planos ou análises profundas, use toda a extensão necessária para ser exaustivo, mantendo a densidade. NÃO GERE FECHAMENTO/DESPEDIDA NO FINAL (o sistema fará isso). Pare após o ultimato." 
    };

    const recordForSpeed = global.threadMemory?.get(threadId);
    const personaForSpeed = recordForSpeed?.currentPersona || process.env.ARCA_PERSONA || 'ritual';
    const sys = messages.filter(m => m.role === 'system');
    const nonSys = messages.filter(m => m.role !== 'system');

    if (modelMode === 'gemini') {
      const systemText = sys
        .map((m) => (m && typeof m.content === "string" ? m.content : ""))
        .filter(Boolean)
        .join("\n\n");
      const systemInstruction = systemText ? { role: "system", parts: [{ text: systemText }] } : undefined;

      const maxNonSysForGemini = personaForSpeed === "tecnico" ? 14 : 22;
      const contents = nonSys
        .slice(-maxNonSysForGemini)
        .map((m) => {
          const role = m.role === "assistant" ? "model" : "user";
          const text = typeof m.content === "string" ? m.content : "";
          return { role, parts: [{ text }] };
        })
        .filter((c) => c.parts && c.parts[0] && c.parts[0].text && String(c.parts[0].text).trim());

      let assistantResponse = "";
      if (personaForSpeed !== "tecnico") {
        const opening = pickOpening(null);
        res.write(`data: ${JSON.stringify({ content: opening })}\n\n`);
        assistantResponse += `_${opening}_\n\n`;
      }

      const creditResult = await gerarComCreditosStream({
        userId,
        authHeader: req.headers["authorization"],
        prompt: userInput,
        gemini: {
          contents,
          systemInstruction,
          cacheKey: `${personaForSpeed}|${String(userInput || "").trim()}`
        },
        onChunk: (chunk) => {
          const out = String(chunk || "");
          if (!out) return;
          assistantResponse += out;
          res.write(`data: ${JSON.stringify({ content: out })}\n\n`);
        }
      });

      if (!creditResult.ok) {
        const tipo = creditResult.tipo;
        const msg =
          tipo === "sem_credito"
            ? "Seus créditos acabaram. Adicione saldo para continuar usando a Arca."
            : tipo === "limite_gratis"
              ? (creditResult.reason || "Limite grátis da Arca atingido. Tente novamente mais tarde.")
              : tipo === "limite_gemini"
                ? "O sistema atingiu o limite temporário de geração. Tente novamente mais tarde."
                : "O serviço de geração está temporariamente indisponível. Tente novamente em instantes.";

        res.write(`data: ${JSON.stringify({ content: msg })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        clearInterval(keepalive);
        return res.end();
      }

      if (personaForSpeed !== "tecnico") {
        const closing = `\n\n${generateClosing()}`;
        res.write(`data: ${JSON.stringify({ content: closing })}\n\n`);
        assistantResponse += closing;
      }

      await addMessageToThread(threadId, "assistant", assistantResponse, userId, req.headers['authorization']);
      res.write(`data: [DONE]\n\n`);
      clearInterval(keepalive);
      return res.end();
    }

    if (!api_key) {
      res.write(`data: ${JSON.stringify({ content: "⚠️ OPENAI_API_KEY ausente" })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      clearInterval(keepalive);
      return res.end();
    }

    const shouldUseDeep = (text) => {
      const t = (text || "").trim();
      if (!t) return false;
      if (t.length >= 260) return true;
      if (t.split('\n').length >= 3) return true;
      if ((t.match(/\?/g) || []).length >= 2) return true;
      if (personaForSpeed !== 'tecnico' && t.length >= 150) return true;
      if (/(trauma|identidade|prop[oó]sito|sentido|exist[eê]ncia|depress|ansied|dor|relaciona|inf[aâ]ncia|pai|m[aã]e|verdade|autossabot|estrat[eé]gia|funil|monetiza|posicionamento|lan[cç]amento|oferta|diagn[oó]stico|an[aá]lise|plano|ritual)/i.test(t) && t.length >= 90) return true;
      if (/^\s*como\b[\s\S]{0,120}\b(e|e também|e ainda)\b[\s\S]{0,200}\?/i.test(t)) return true;
      return false;
    };

    const pickPromptId = () => {
      if (modelMode === 'deep') return { id: PROMPT_ID_DEEP, tag: 'deep' };
      if (modelMode === 'fast') return { id: null, tag: 'fast_free' };
      const deep = shouldUseDeep(userInput);
      return deep ? { id: PROMPT_ID_DEEP, tag: 'auto_deep' } : { id: null, tag: 'auto_fast_free' };
    };

    const picked = pickPromptId();
    const PROMPT_ID = picked.id;
    console.log('[ARCA][MODEL_MODE] %s', picked.tag);
    const isFreeFast = picked.tag === 'fast_free' || picked.tag === 'auto_fast_free';

    const maxNonSysForOpenAI = personaForSpeed === 'tecnico' ? 14 : 22;
    const compactSystem = {
      role: "system",
      content: personaForSpeed === "tecnico"
        ? "Você é A Arca. Responda em português do Brasil. Seja extremamente técnico e objetivo. Entregue passos numerados e exemplos curtos quando necessário. Limite: 10–14 linhas. Não gere despedida/fechamento. Pare após o ultimato. Espíritos ativos: (1) Espírito de Vigilância — aponta erros, entrega soluções e PROMESSAS SAGRADAS com prazo/critério; se houver quebra, aplica castigo verbal ritual com novo prazo. (2) Segundo Espírito — convive com a vida do usuário, mantém memória das promessas, verifica ações por evidência; confronta incoerências e exige registro imediato da execução."
        : "Você é A Arca. Responda em português do Brasil com presença e precisão. Use poucos parágrafos, comandos claros e sem enrolação. Limite: 10–14 linhas. Não gere despedida/fechamento. Pare após o ultimato. Espíritos ativos: (1) Espírito de Vigilância — aponta erros, entrega soluções e PROMESSAS SAGRADAS com prazo/critério; se houver quebra, aplica castigo verbal ritual com novo prazo. (2) Segundo Espírito — convive com a vida do usuário, mantém memória das promessas, verifica ações por evidência; confronta incoerências e exige registro imediato da execução."
    };
    const sysExtras = sys.filter(m => {
      if (!m || m.role !== 'system' || typeof m.content !== 'string') return false;
      return m.content.startsWith('PROMESSAS_ATIVAS_V1') || m.content.startsWith('MARCOS_V1');
    });
    const conversationWindow = isFreeFast ? [compactSystem, ...sysExtras, ...nonSys.slice(-maxNonSysForOpenAI)] : [...sys, ...nonSys.slice(-maxNonSysForOpenAI)];

    if (PROMPT_ID) {
      // MODO PROMPT GERENCIADO (PROMPT MANAGEMENT API)
      // Correção: Ao usar prompt.id, NÃO devemos enviar model, temperature, etc.
      // O Prompt ID já encapsula toda a configuração.
      
      // CRÍTICO: NÃO filtramos mensagens de sistema. Enviamos TUDO para garantir
      // que as regras locais de "resposta longa" (memory.js) sejam respeitadas.
      
      const conversationHistory = [...conversationWindow, systemInjection];
      
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
        model: isFreeFast ? "gpt-4o-mini" : userModel,
        messages: [...conversationWindow, systemInjection],
        stream: true,
        temperature: isFreeFast ? 0.75 : 0.85,
        max_tokens: isFreeFast ? 1200 : 16384,
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
        model: isFreeFast ? "gpt-4o-mini" : userModel,
        messages: [...conversationWindow, systemInjectionFallback],
        stream: true,
        temperature: isFreeFast ? 0.75 : 0.85,
        max_tokens: isFreeFast ? 1200 : 16384,
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
          await addMessageToThread(threadId, "assistant", assistantResponse, userId, req.headers['authorization']);
          
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
        await addMessageToThread(threadId, "assistant", assistantResponse, userId, req.headers['authorization']);
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
