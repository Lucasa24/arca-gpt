const fs = require("fs");
const path = require("path");

const QUOTA_FILE = path.join(__dirname, "../database/gemini_usage.json");
const MEMORY = new Map();

function nowIso() {
  return new Date().toISOString();
}

function normalizeUserId(userId) {
  const u = String(userId || "").trim();
  return u || null;
}

function dayKeyUtc(iso) {
  try {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function readLocalFile() {
  try {
    if (!fs.existsSync(QUOTA_FILE)) return {};
    const raw = fs.readFileSync(QUOTA_FILE, "utf8");
    const json = raw ? JSON.parse(raw) : {};
    return json && typeof json === "object" ? json : {};
  } catch {
    return {};
  }
}

function writeLocalFile(obj) {
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(obj, null, 2));
  } catch {}
}

function getConfig() {
  const freeRequestsDay = Math.max(0, Math.floor(Number(process.env.GEMINI_FREE_DAILY_REQUESTS || 100)));
  const freeTokensDay = Math.max(0, Math.floor(Number(process.env.GEMINI_FREE_DAILY_TOKENS || 0)));
  return { freeRequestsDay, freeTokensDay };
}

function defaultUsageRecord(userId) {
  const now = nowIso();
  return {
    user_id: userId,
    requests_do_dia: 0,
    tokens_input: 0,
    tokens_output: 0,
    modelo_usado: null,
    blocked_free: false,
    blocked_reason: null,
    ultimo_reset: now,
    updated_at: now
  };
}

function resetIfNeeded(rec) {
  const last = rec && rec.ultimo_reset ? String(rec.ultimo_reset) : "";
  const today = dayKeyUtc(nowIso());
  const lastDay = dayKeyUtc(last);
  if (today && lastDay && today === lastDay) return rec;
  rec.requests_do_dia = 0;
  rec.tokens_input = 0;
  rec.tokens_output = 0;
  rec.modelo_usado = null;
  rec.blocked_free = false;
  rec.blocked_reason = null;
  rec.ultimo_reset = nowIso();
  return rec;
}

async function getOrCreateGeminiUsage(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return null;
  if (MEMORY.has(uid)) return resetIfNeeded(MEMORY.get(uid));
  const disk = readLocalFile();
  const rec = disk && disk[uid] ? disk[uid] : defaultUsageRecord(uid);
  resetIfNeeded(rec);
  MEMORY.set(uid, rec);
  return rec;
}

async function saveGeminiUsage(rec) {
  if (!rec || !rec.user_id) return;
  rec.updated_at = nowIso();
  MEMORY.set(rec.user_id, rec);
  const disk = readLocalFile();
  disk[rec.user_id] = rec;
  writeLocalFile(disk);
}

function estimateTokensFromText(text) {
  const t = String(text || "");
  return Math.max(0, Math.ceil(t.length / 4));
}

function extractUsageCounts({ usage, prompt, resposta }) {
  const u = usage && typeof usage === "object" ? usage : {};
  const promptTokenCount = Number(u.promptTokenCount);
  const candidatesTokenCount = Number(u.candidatesTokenCount);
  const totalTokenCount = Number(u.totalTokenCount);

  if (Number.isFinite(promptTokenCount) || Number.isFinite(candidatesTokenCount)) {
    return {
      inTok: Math.max(0, Number.isFinite(promptTokenCount) ? promptTokenCount : 0),
      outTok: Math.max(0, Number.isFinite(candidatesTokenCount) ? candidatesTokenCount : 0),
      totalTok: Math.max(
        0,
        Number.isFinite(totalTokenCount) ? totalTokenCount : (Math.max(0, Number.isFinite(promptTokenCount) ? promptTokenCount : 0) + Math.max(0, Number.isFinite(candidatesTokenCount) ? candidatesTokenCount : 0))
      )
    };
  }

  const inTok = estimateTokensFromText(prompt);
  const outTok = estimateTokensFromText(resposta);
  return { inTok, outTok, totalTok: inTok + outTok };
}

async function addGeminiUsage(userId, { model, usage, prompt, resposta } = {}) {
  const rec = await getOrCreateGeminiUsage(userId);
  if (!rec) return null;
  resetIfNeeded(rec);

  rec.requests_do_dia = Math.max(0, Math.floor(Number(rec.requests_do_dia || 0))) + 1;
  rec.modelo_usado = model ? String(model) : (rec.modelo_usado || null);

  const counts = extractUsageCounts({ usage, prompt, resposta });
  rec.tokens_input = Math.max(0, Math.floor(Number(rec.tokens_input || 0))) + Math.max(0, Math.floor(Number(counts.inTok || 0)));
  rec.tokens_output = Math.max(0, Math.floor(Number(rec.tokens_output || 0))) + Math.max(0, Math.floor(Number(counts.outTok || 0)));

  await saveGeminiUsage(rec);
  return rec;
}

function quotaStateFromUsage(rec) {
  const cfg = getConfig();
  const usedReq = Math.max(0, Math.floor(Number(rec && rec.requests_do_dia || 0)));
  const usedTok = Math.max(0, Math.floor(Number(rec && (Number(rec.tokens_input || 0) + Number(rec.tokens_output || 0)) || 0)));

  const limReq = cfg.freeRequestsDay;
  const limTok = cfg.freeTokensDay;

  const hasReqLimit = limReq > 0;
  const hasTokLimit = limTok > 0;

  const remainingReq = hasReqLimit ? Math.max(0, limReq - usedReq) : Infinity;
  const remainingTok = hasTokLimit ? Math.max(0, limTok - usedTok) : Infinity;

  const ratioReq = hasReqLimit ? Math.max(0, Math.min(1, remainingReq / limReq)) : 1;
  const ratioTok = hasTokLimit ? Math.max(0, Math.min(1, remainingTok / limTok)) : 1;

  const ratio = Math.min(ratioReq, ratioTok);
  const blockedFlag = !!(rec && rec.blocked_free);
  const freeExhausted = (hasReqLimit && usedReq >= limReq) || (hasTokLimit && usedTok >= limTok);
  const freeBlocked = blockedFlag;

  return {
    usedReq,
    limReq,
    usedTok,
    limTok,
    ratio,
    blockedFlag,
    freeBlocked,
    freeExhausted
  };
}

function toneFromRatio(ratio) {
  const r = Number(ratio);
  if (!Number.isFinite(r) || r <= 0) return "red";
  if (r <= 0.33) return "red";
  if (r <= 0.66) return "orange";
  return "green";
}

async function getUsageBar(userId, { paidCredits = 0 } = {}) {
  const rec = await getOrCreateGeminiUsage(userId);
  const state = quotaStateFromUsage(rec || {});

  const paid = Math.max(0, Math.floor(Number(paidCredits || 0)));

  if (state.blockedFlag && paid > 0) {
    return {
      ratio: 1,
      tone: "green",
      label: "Ativo com créditos",
      hint: "Sua cota grátis do Vigoroso foi atingida. Créditos mantêm o acesso ativo.",
      usedRequestsDay: state.usedReq,
      limitRequestsDay: state.limReq,
      usedTokensDay: state.usedTok,
      limitTokensDay: state.limTok,
      ultimoReset: rec ? rec.ultimo_reset : null
    };
  }

  if (state.blockedFlag) {
    return {
      ratio: 0,
      tone: "empty",
      label: "Limite atingido",
      hint: "Limite grátis do Vigoroso atingido. Adicione créditos para continuar.",
      usedRequestsDay: state.usedReq,
      limitRequestsDay: state.limReq,
      usedTokensDay: state.usedTok,
      limitTokensDay: state.limTok,
      ultimoReset: rec ? rec.ultimo_reset : null
    };
  }

  const ratio = Math.max(0, Math.min(1, state.ratio));
  const tone = toneFromRatio(ratio);
  const label =
    tone === "green" ? "Cota saudável" :
    tone === "orange" ? "Cota em atenção" :
    "Cota crítica";
  const hint =
    ratio <= 0.02
      ? "Você está no limite. O Gemini pode bloquear a qualquer momento. Quando bloquear, adicione créditos para continuar."
      : "A barra mostra sua margem de uso no Vigoroso. Quanto mais você usa, mais ela desce.";

  return {
    ratio,
    tone,
    label,
    hint,
    usedRequestsDay: state.usedReq,
    limitRequestsDay: state.limReq,
    usedTokensDay: state.usedTok,
    limitTokensDay: state.limTok,
    ultimoReset: rec ? rec.ultimo_reset : null
  };
}

async function shouldBlockFree(userId) {
  const rec = await getOrCreateGeminiUsage(userId);
  const state = quotaStateFromUsage(rec || {});
  return { blocked: !!state.blockedFlag, exhausted: !!state.freeExhausted, state, record: rec };
}

async function markFreeExhausted(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return null;
  const rec = await getOrCreateGeminiUsage(uid);
  if (!rec) return null;
  resetIfNeeded(rec);
  const cfg = getConfig();
  rec.blocked_free = true;
  rec.blocked_reason = "RESOURCE_EXHAUSTED";
  if (cfg.freeRequestsDay > 0) rec.requests_do_dia = Math.max(rec.requests_do_dia || 0, cfg.freeRequestsDay);
  if (cfg.freeTokensDay > 0) {
    const half = Math.floor(cfg.freeTokensDay / 2);
    rec.tokens_input = Math.max(rec.tokens_input || 0, half);
    rec.tokens_output = Math.max(rec.tokens_output || 0, cfg.freeTokensDay - half);
  }
  await saveGeminiUsage(rec);
  return rec;
}

module.exports = {
  getOrCreateGeminiUsage,
  addGeminiUsage,
  getUsageBar,
  shouldBlockFree,
  markFreeExhausted
};
