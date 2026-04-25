const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { gerarMensagemGemini } = require("../api/gemini.js");

const CREDIT_FILE = path.join(__dirname, "../database/credits.json");
const MEMORY = new Map();

const CREDIT_UNIT_TOKENS = 100;

let supabaseService = null;
let HAS_SERVICE = false;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_KEY;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

try {
  if (SUPABASE_URL && SUPABASE_SERVICE) {
    supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    HAS_SERVICE = true;
  }
} catch {}

function getSupabaseForRequest(authHeader) {
  if (HAS_SERVICE && supabaseService) return supabaseService;
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  if (!authHeader) return null;
  try {
    return createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: authHeader } } });
  } catch {
    return null;
  }
}

function readLocalFile() {
  try {
    if (!fs.existsSync(CREDIT_FILE)) return {};
    const raw = fs.readFileSync(CREDIT_FILE, "utf8");
    const json = raw ? JSON.parse(raw) : {};
    return json && typeof json === "object" ? json : {};
  } catch {
    return {};
  }
}

function writeLocalFile(obj) {
  try {
    fs.writeFileSync(CREDIT_FILE, JSON.stringify(obj, null, 2));
  } catch {}
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeUserId(userId) {
  const u = String(userId || "").trim();
  return u || null;
}

function defaultCreditsRecord(userId) {
  return {
    user_id: userId,
    creditos_disponiveis: 0,
    creditos_gastos: 0,
    historico_de_recargas: [],
    historico_de_consumo: [],
    updated_at: nowIso()
  };
}

async function getOrCreateCredits(userId, authHeader) {
  const uid = normalizeUserId(userId);
  if (!uid) return null;

  const sb = getSupabaseForRequest(authHeader);
  if (sb) {
    try {
      const { data, error } = await sb
        .from("user_credits")
        .select("user_id, creditos_disponiveis, creditos_gastos, historico_de_recargas, historico_de_consumo, updated_at")
        .eq("user_id", uid)
        .single();

      if (!error && data) return data;

      const record = defaultCreditsRecord(uid);
      const { data: created } = await sb.from("user_credits").upsert(record).select().single();
      return created || record;
    } catch {}
  }

  if (MEMORY.has(uid)) return MEMORY.get(uid);
  const disk = readLocalFile();
  const rec = disk && disk[uid] ? disk[uid] : defaultCreditsRecord(uid);
  MEMORY.set(uid, rec);
  return rec;
}

async function saveCredits(record, authHeader) {
  if (!record || !record.user_id) return;
  record.updated_at = nowIso();

  const sb = getSupabaseForRequest(authHeader);
  if (sb) {
    try {
      await sb.from("user_credits").upsert(record);
      return;
    } catch {}
  }

  MEMORY.set(record.user_id, record);
  const disk = readLocalFile();
  disk[record.user_id] = record;
  writeLocalFile(disk);
}

async function adicionarCreditos(userId, valor, meta = {}, authHeader = null) {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, error: "userId ausente" };

  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return { ok: false, error: "valor inválido" };

  const rec = await getOrCreateCredits(uid, authHeader);
  if (!rec) return { ok: false, error: "estado inválido" };

  rec.creditos_disponiveis = Number(rec.creditos_disponiveis || 0) + v;
  rec.historico_de_recargas = Array.isArray(rec.historico_de_recargas) ? rec.historico_de_recargas : [];
  rec.historico_de_recargas.unshift({
    valor: v,
    created_at: nowIso(),
    origem: meta.origem || "webhook",
    referencia: meta.referencia || null,
    bruto: meta.bruto || null
  });

  await saveCredits(rec, authHeader);
  return { ok: true, record: rec };
}

async function debitarCreditos(userId, valor, dados = {}, authHeader = null) {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, error: "userId ausente" };

  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return { ok: false, error: "valor inválido" };

  const rec = await getOrCreateCredits(uid, authHeader);
  if (!rec) return { ok: false, error: "estado inválido" };

  const disponivel = Number(rec.creditos_disponiveis || 0);
  const debitado = Math.min(disponivel, v);
  rec.creditos_disponiveis = disponivel - debitado;
  rec.creditos_gastos = Number(rec.creditos_gastos || 0) + debitado;

  rec.historico_de_consumo = Array.isArray(rec.historico_de_consumo) ? rec.historico_de_consumo : [];
  rec.historico_de_consumo.unshift({
    valor: debitado,
    created_at: nowIso(),
    ...dados
  });

  await saveCredits(rec, authHeader);
  return { ok: true, debitado, record: rec };
}

function estimarTokens({ prompt, resposta, uso }) {
  if (uso && Number.isFinite(Number(uso.totalTokenCount))) return Number(uso.totalTokenCount);
  const p = String(prompt || "");
  const r = String(resposta || "");
  const approx = Math.ceil(p.length / 4) + Math.ceil(r.length / 4);
  return Math.max(1, approx);
}

function estimarCustoCreditos({ tokens, cache }) {
  if (cache) return 0;
  return Math.max(1, Math.ceil(Number(tokens || 0) / CREDIT_UNIT_TOKENS));
}

async function criarCheckoutCredito(userId, valor) {
  const uid = normalizeUserId(userId);
  const v = Number(valor);
  if (!uid) return { ok: false, error: "userId ausente" };
  if (!Number.isFinite(v) || v <= 0) return { ok: false, error: "valor inválido" };

  const checkoutId = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    ok: true,
    checkoutId,
    status: "pending",
    valor: v,
    provider: "pendente"
  };
}

async function confirmarPagamentoWebhook(evento, reqHeaders = {}) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (secret) {
    const got = reqHeaders["x-webhook-secret"] || reqHeaders["x-payment-webhook-secret"];
    if (String(got || "") !== String(secret)) {
      return { ok: false, error: "webhook não autorizado" };
    }
  }

  const e = evento && typeof evento === "object" ? evento : {};
  const status = String(e.status || e.event || "").toLowerCase();
  const aprovado = status === "approved" || status === "paid" || status === "confirmed" || status === "payment_approved";
  if (!aprovado) return { ok: false, error: "pagamento não aprovado" };

  const userId = e.userId || e.user_id;
  const creditos = e.creditos || e.credits || e.valor_creditos;
  const ref = e.reference || e.payment_id || e.id || null;

  const add = await adicionarCreditos(userId, creditos, { origem: "webhook", referencia: ref, bruto: e }, null);
  if (!add.ok) return add;

  return { ok: true, mensagem: "Créditos adicionados com sucesso.", record: add.record };
}

async function gerarComCreditos({ userId, prompt, authHeader = null, gemini = {} }) {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, tipo: "sem_credito" };

  const rec = await getOrCreateCredits(uid, authHeader);
  if (!rec) return { ok: false, tipo: "sem_credito" };

  const disponivel = Number(rec.creditos_disponiveis || 0);
  if (disponivel <= 0) return { ok: false, tipo: "sem_credito" };

  const r = await gerarMensagemGemini(prompt, {
    contents: gemini.contents,
    systemInstruction: gemini.systemInstruction,
    cacheKey: gemini.cacheKey
  });

  if (!r.ok) return r;

  const tokens = estimarTokens({ prompt, resposta: r.mensagem, uso: r.uso });
  const custo = estimarCustoCreditos({ tokens, cache: !!r.cache });

  if (custo > 0) {
    await debitarCreditos(uid, custo, {
      tipo: "gemini",
      modelo: r.modelo,
      tokens,
      cache: !!r.cache,
      prompt_len: String(prompt || "").length
    }, authHeader);
  }

  const updated = await getOrCreateCredits(uid, authHeader);
  return {
    ok: true,
    mensagem: r.mensagem,
    modelo: r.modelo,
    cache: !!r.cache,
    custoCreditos: custo,
    creditosRestantes: updated ? Number(updated.creditos_disponiveis || 0) : undefined
  };
}

module.exports = {
  getOrCreateCredits,
  criarCheckoutCredito,
  confirmarPagamentoWebhook,
  adicionarCreditos,
  debitarCreditos,
  gerarComCreditos
};

