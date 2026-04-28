const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { gerarMensagemGemini } = require("../api/gemini.js");

const CREDIT_FILE = path.join(__dirname, "../database/credits.json");
const MEMORY = new Map();

const CREDIT_UNIT_TOKENS = 100;

const FREE_INIT_REF = "free_init_v1";
const FREE_CREDITS = Math.max(
  0,
  Math.floor(Number(process.env.GEMINI_FREE_CREDITS || process.env.ARCA_GEMINI_FREE_CREDITS || 30))
);

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sumBy(list, pred) {
  return (Array.isArray(list) ? list : []).reduce((acc, it) => {
    if (!it || (pred && !pred(it))) return acc;
    return acc + toNum(it.valor);
  }, 0);
}

function hasFreeInit(rec) {
  const items = Array.isArray(rec && rec.historico_de_recargas) ? rec.historico_de_recargas : [];
  return items.some((x) => x && String(x.origem || "") === "free" && String(x.referencia || "") === FREE_INIT_REF);
}

async function ensureFreeGrant(rec, authHeader) {
  if (!rec || !rec.user_id) return rec;
  if (!FREE_CREDITS) return rec;
  if (hasFreeInit(rec)) return rec;

  rec.historico_de_recargas = Array.isArray(rec.historico_de_recargas) ? rec.historico_de_recargas : [];
  rec.creditos_disponiveis = toNum(rec.creditos_disponiveis) + FREE_CREDITS;
  rec.historico_de_recargas.unshift({
    valor: FREE_CREDITS,
    created_at: nowIso(),
    origem: "free",
    referencia: FREE_INIT_REF
  });
  await saveCredits(rec, authHeader);
  return rec;
}

function calcularSaldosCreditos(rec) {
  const total = Math.max(0, Math.floor(toNum(rec && rec.creditos_disponiveis)));
  const freeAdded = sumBy(rec && rec.historico_de_recargas, (x) => String(x.origem || "") === "free");
  const freeSpent = sumBy(rec && rec.historico_de_consumo, (x) => String(x.bucket || "") === "free");
  const freeRemaining = Math.max(0, Math.floor(freeAdded - freeSpent));
  const free = Math.min(freeRemaining, total);
  const paid = Math.max(0, total - free);
  return { total, free, paid };
}

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

      if (!error && data) return await ensureFreeGrant(data, authHeader);

      const record = defaultCreditsRecord(uid);
      const { data: created } = await sb.from("user_credits").upsert(record).select().single();
      return await ensureFreeGrant(created || record, authHeader);
    } catch {}
  }

  if (MEMORY.has(uid)) return MEMORY.get(uid);
  const disk = readLocalFile();
  const rec = disk && disk[uid] ? disk[uid] : defaultCreditsRecord(uid);
  await ensureFreeGrant(rec, authHeader);
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

  const referencia = meta && meta.referencia ? String(meta.referencia) : null;
  rec.historico_de_recargas = Array.isArray(rec.historico_de_recargas) ? rec.historico_de_recargas : [];
  if (referencia) {
    const dup = rec.historico_de_recargas.find((x) => x && String(x.referencia || "") === referencia);
    if (dup) return { ok: true, record: rec, idempotente: true };
  }

  rec.creditos_disponiveis = Number(rec.creditos_disponiveis || 0) + v;
  rec.historico_de_recargas.unshift({
    valor: v,
    created_at: nowIso(),
    origem: meta.origem || "webhook",
    referencia,
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

async function registrarConsumo(userId, dados = {}, authHeader = null) {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, error: "userId ausente" };

  const rec = await getOrCreateCredits(uid, authHeader);
  if (!rec) return { ok: false, error: "estado inválido" };

  rec.historico_de_consumo = Array.isArray(rec.historico_de_consumo) ? rec.historico_de_consumo : [];
  rec.historico_de_consumo.unshift({
    created_at: nowIso(),
    ...dados
  });

  await saveCredits(rec, authHeader);
  return { ok: true, record: rec };
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
  const tpl = String(process.env.CHECKOUT_URL_TEMPLATE || "");
  const provider = String(process.env.CHECKOUT_PROVIDER || "pendente");
  const checkoutUrl = tpl
    ? tpl
        .replace(/\{checkoutId\}/g, encodeURIComponent(checkoutId))
        .replace(/\{userId\}/g, encodeURIComponent(uid))
        .replace(/\{valor\}/g, encodeURIComponent(String(v)))
    : null;
  return {
    ok: true,
    checkoutId,
    status: "pending",
    valor: v,
    provider,
    checkoutUrl
  };
}

async function confirmarPagamentoWebhook(evento, reqHeaders = {}) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return { ok: false, error: "webhook secret não configurado" };
  const got = reqHeaders["x-webhook-secret"] || reqHeaders["x-payment-webhook-secret"];
  if (String(got || "") !== String(secret)) return { ok: false, error: "webhook não autorizado" };

  const e = evento && typeof evento === "object" ? evento : {};
  const status = String(e.status || e.event || "").toLowerCase();
  const aprovado = status === "approved" || status === "paid" || status === "confirmed" || status === "payment_approved";
  if (!aprovado) return { ok: false, error: "pagamento não aprovado" };

  const userId = e.userId || e.user_id;
  const ref = e.reference || e.payment_id || e.id || null;
  if (!ref) return { ok: false, error: "referencia ausente" };

  let creditos = e.creditos || e.credits || e.valor_creditos;
  if (!creditos) {
    const amountRaw = e.amount || e.valor || e.paid_amount || e.total || e.valor_total;
    const amount = Number(amountRaw);
    const rate = Number(process.env.CREDITS_PER_BRL || 1);
    if (Number.isFinite(amount) && amount > 0 && Number.isFinite(rate) && rate > 0) {
      creditos = Math.max(1, Math.floor(amount * rate));
    }
  }

  const add = await adicionarCreditos(userId, creditos, { origem: "webhook", referencia: ref, bruto: e }, null);
  if (!add.ok) return add;

  return { ok: true, mensagem: "Créditos adicionados com sucesso.", record: add.record };
}

async function gerarComCreditos({ userId, prompt, authHeader = null, gemini = {} }) {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, tipo: "sem_credito" };

  const rec = await getOrCreateCredits(uid, authHeader);
  if (!rec) return { ok: false, tipo: "sem_credito" };

  const saldosAntes = calcularSaldosCreditos(rec);
  if (saldosAntes.total <= 0) return { ok: false, tipo: "sem_credito" };

  const r = await gerarMensagemGemini(prompt, {
    contents: gemini.contents,
    systemInstruction: gemini.systemInstruction,
    cacheKey: gemini.cacheKey
  });

  if (!r.ok) return r;

  const tokens = estimarTokens({ prompt, resposta: r.mensagem, uso: r.uso });
  const custo = estimarCustoCreditos({ tokens, cache: !!r.cache });

  if (custo > 0) {
    let restante = custo;
    const freeDebit = Math.min(saldosAntes.free, restante);
    if (freeDebit > 0) {
      await debitarCreditos(uid, freeDebit, {
        tipo: "gemini",
        bucket: "free",
        modelo: r.modelo,
        tokens,
        cache: !!r.cache,
        prompt_len: String(prompt || "").length
      }, authHeader);
      restante -= freeDebit;
    }
    if (restante > 0) {
      await debitarCreditos(uid, restante, {
        tipo: "gemini",
        bucket: "paid",
        modelo: r.modelo,
        tokens,
        cache: !!r.cache,
        prompt_len: String(prompt || "").length
      }, authHeader);
    }
  }

  const updated = await getOrCreateCredits(uid, authHeader);
  const saldosDepois = updated ? calcularSaldosCreditos(updated) : { total: undefined, free: undefined, paid: undefined };
  return {
    ok: true,
    mensagem: r.mensagem,
    modelo: r.modelo,
    cache: !!r.cache,
    custoCreditos: custo,
    creditosRestantes: saldosDepois.total,
    creditosGratisRestantes: saldosDepois.free,
    creditosPagosRestantes: saldosDepois.paid
  };
}

module.exports = {
  getOrCreateCredits,
  calcularSaldosCreditos,
  criarCheckoutCredito,
  confirmarPagamentoWebhook,
  adicionarCreditos,
  debitarCreditos,
  registrarConsumo,
  gerarComCreditos
};
