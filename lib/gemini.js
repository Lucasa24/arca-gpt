const { fetch } = require("undici");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const CACHE = new Map();
const CACHE_TTL = 1000 * 60 * 5;

let MODELOS_CACHE = { estaveis: [], preview: [], atualizadoEm: 0 };

function classificarPrompt(prompt) {
  const p = String(prompt || "");
  if (p.length < 100) return "simples";
  if (p.length < 500) return "medio";
  return "complexo";
}

function selecionarModelosPorTipo(tipo, modelos) {
  const ordem = Array.isArray(modelos && modelos.estaveis) ? modelos.estaveis.slice() : [];
  const preview = Array.isArray(modelos && modelos.preview) ? modelos.preview.slice() : [];

  if (tipo === "simples") {
    return {
      estaveis: ordem.filter((m) => String(m).includes("flash")),
      preview
    };
  }

  if (tipo === "medio") {
    return { estaveis: ordem, preview };
  }

  return { estaveis: ordem.reverse(), preview };
}

function extrair(n) {
  return String(n || "").split("/").pop().replace(/:generateContent$/i, "");
}

function priorizar(lista) {
  const ordem = ["flash-lite", "flash", "pro"];
  const score = (name) => {
    const n = String(name || "");
    const idx = ordem.findIndex((o) => n.includes(o));
    return idx === -1 ? 999 : idx;
  };
  return (Array.isArray(lista) ? lista : []).slice().sort((a, b) => score(a) - score(b));
}

function uniq(list) {
  return Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean)));
}

async function fetchJson(url) {
  const res = await fetch(url, { method: "GET" });
  const text = await res.text().catch(() => "");
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { ok: res.ok, status: res.status, json };
}

async function obterModelos(apiKey) {
  const agora = Date.now();
  if (agora - MODELOS_CACHE.atualizadoEm < 600000 && (MODELOS_CACHE.estaveis.length || MODELOS_CACHE.preview.length)) {
    return MODELOS_CACHE;
  }

  const key = String(apiKey || "");
  if (!key) {
    MODELOS_CACHE = { estaveis: [], preview: [], atualizadoEm: agora };
    return MODELOS_CACHE;
  }

  const endpoints = [
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(key)}`
  ];

  let data;
  for (const url of endpoints) {
    try {
      const r = await fetchJson(url);
      if (r.ok && r.json) {
        data = r.json;
        break;
      }
    } catch {}
  }

  const estaveis = [];
  const preview = [];

  for (const m of (data && Array.isArray(data.models) ? data.models : [])) {
    const nome = String(m && m.name ? m.name : "");
    const methods = Array.isArray(m && m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
    const supports = methods.includes("generateContent") || /gemini/i.test(nome);
    if (!supports) continue;

    const ex = extrair(nome);
    if (!ex) continue;

    if (/preview|exp|experimental|alpha|beta/i.test(ex)) preview.push(ex);
    else estaveis.push(ex);
  }

  const stable = priorizar(uniq(estaveis));
  const prev = uniq(preview);

  MODELOS_CACHE = {
    estaveis: stable.length ? stable : ["gemini-1.5-flash", "gemini-1.5-pro"],
    preview: prev.length ? prev : ["gemini-1.5-flash-preview", "gemini-1.5-pro-preview"],
    atualizadoEm: agora
  };

  return MODELOS_CACHE;
}

function tratarErro(status) {
  if (status === 429) return { ok: false, tipo: "limite_gemini" };
  if (status === 403) return { ok: false, tipo: "acesso_bloqueado" };
  if (status === 404) return { ok: false, tipo: "modelo_indisponivel" };
  if (status === 400) return { ok: false, tipo: "requisicao_invalida" };
  if (status >= 500) return { ok: false, tipo: "erro_google" };
  return { ok: false, tipo: "erro_desconhecido" };
}

function extrairTextoCandidates(data) {
  const parts =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    Array.isArray(data.candidates[0].content.parts)
      ? data.candidates[0].content.parts
      : [];
  return parts
    .map((p) => (p && typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("");
}

async function chamarModelo({ model, prompt, apiKey, contents, systemInstruction }) {
  const key = String(apiKey || "");
  if (!key) {
    return {
      ok: false,
      tipo: "sem_api_key",
      mensagemUsuario: "Conecte sua chave gratuita do Google (BYOK) para usar o modo Vigoroso."
    };
  }

  const body = {
    contents: Array.isArray(contents) && contents.length
      ? contents
      : [{ role: "user", parts: [{ text: String(prompt || "") }] }]
  };
  if (systemInstruction && typeof systemInstruction === "object") body.systemInstruction = systemInstruction;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(String(model || ""))}:generateContent?key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const text = await res.text().catch(() => "");
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!res.ok) return { ...tratarErro(res.status), status: res.status };

    return {
      ok: true,
      mensagem: extrairTextoCandidates(data),
      modelo: String(model || ""),
      uso: data && data.usageMetadata ? data.usageMetadata : undefined
    };
  } catch {
    return { ok: false, tipo: "erro_rede" };
  }
}

function deveContinuarFallback(tipo) {
  return tipo === "limite_gemini" || tipo === "modelo_indisponivel" || tipo === "erro_google" || tipo === "erro_desconhecido";
}

async function gerarMensagemGemini(prompt, options = {}) {
  const apiKey = options.apiKey || GEMINI_API_KEY;
  const cacheKey = String((options.cacheKey || prompt || "")).trim();

  if (!apiKey) {
    return {
      ok: false,
      tipo: "sem_api_key",
      mensagemUsuario: "Conecte sua chave gratuita do Google (BYOK) para usar o modo Vigoroso."
    };
  }

  const cached = cacheKey ? CACHE.get(cacheKey) : null;
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return { ...cached.data, cache: true };
  }

  const tipo = classificarPrompt(prompt);
  const modelos = await obterModelos(apiKey);
  const modelosOrdenados = selecionarModelosPorTipo(tipo, modelos);

  for (const model of modelosOrdenados.estaveis) {
    const r = await chamarModelo({
      model,
      prompt,
      apiKey,
      contents: options.contents,
      systemInstruction: options.systemInstruction
    });

    if (r.ok) {
      if (cacheKey) CACHE.set(cacheKey, { data: r, time: Date.now() });
      return r;
    }

    if (!deveContinuarFallback(r.tipo)) return r;
  }

  for (const model of modelosOrdenados.preview) {
    const r = await chamarModelo({
      model,
      prompt,
      apiKey,
      contents: options.contents,
      systemInstruction: options.systemInstruction
    });

    if (r.ok) {
      if (cacheKey) CACHE.set(cacheKey, { data: r, time: Date.now() });
      return r;
    }
  }

  return {
    ok: false,
    tipo: "todos_limites_atingidos",
    mensagemUsuario: "Todos os limites gratuitos foram atingidos. Conecte sua chave gratuita do Google para continuar."
  };
}

module.exports = {
  gerarMensagemGemini,
  obterModelos
};
