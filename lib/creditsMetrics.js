const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const METRICS_WARN = process.env.ARCA_METRICS_WARN === "1" && process.env.NODE_ENV !== "production";

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampNonNegInt(v, label = "") {
  const raw = v;
  const n = Math.floor(toNum(v));
  const out = n <= 0 ? 0 : (n > MAX_SAFE ? MAX_SAFE : n);
  if (METRICS_WARN) {
    const invalid =
      raw === null ||
      typeof raw === "undefined" ||
      (typeof raw === "number" && !Number.isFinite(raw)) ||
      (typeof raw === "string" && raw.trim() !== "" && !Number.isFinite(Number(raw)));
    const negative = typeof raw === "number" && Number.isFinite(raw) && raw < 0;
    if (invalid || negative) {
      console.warn("[METRICS][WARN] clampNonNegInt", label || "-", { kind: invalid ? "invalid" : "negative", type: typeof raw });
    }
  }
  return out;
}

const FREE_DAILY_TOKENS = clampNonNegInt(
  process.env.GEMINI_FREE_DAILY_TOKENS || process.env.ARCA_GEMINI_FREE_DAILY_TOKENS || 20000
);

function sumBy(list, pred) {
  return (Array.isArray(list) ? list : []).reduce((acc, it) => {
    if (!it || (pred && !pred(it))) return acc;
    return acc + toNum(it.valor);
  }, 0);
}

function sumTokens(list, pred) {
  return (Array.isArray(list) ? list : []).reduce((acc, it) => {
    if (!it || (pred && !pred(it))) return acc;
    return acc + clampNonNegInt(it.tokens);
  }, 0);
}

function parseIsoToMs(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v || "").trim();
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

// Critério de “dia” usado nas métricas diárias: UTC (getUTC*), consistente no backend.
function sameUtcDay(aMs, bMs) {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function isPaidTopup(entry) {
  if (!entry) return false;
  const origem = String(entry.origem || "").toLowerCase();
  if (!origem) return false;
  if (origem === "free" || origem === "bonus" || origem === "grant") return false;

  const provider = String(entry.provider || entry.payment_provider || entry.gateway || "").toLowerCase();
  if (provider === "pendente" || provider === "pending") return false;

  const statusRaw = entry.status || (entry.bruto && (entry.bruto.status || entry.bruto.event)) || null;
  const status = String(statusRaw || "").toLowerCase();
  if (!status) {
    const ref = entry.referencia ? String(entry.referencia) : "";
    return (origem === "webhook" || origem === "manual" || origem === "admin") && !!ref;
  }
  return status === "approved" || status === "paid" || status === "confirmed" || status === "payment_approved";
}

function uniqueConsumo(consumo) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(consumo) ? consumo : []) {
    if (!it) continue;
    const id = it.consumption_id ? String(it.consumption_id) : "";
    if (!id) {
      out.push(it);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(it);
  }
  return out;
}

function encontrarUltimaRecargaPagaMs(rec) {
  const recs = Array.isArray(rec && rec.historico_de_recargas) ? rec.historico_de_recargas : [];
  for (const r of recs) {
    if (!isPaidTopup(r)) continue;
    const ms = parseIsoToMs(r.created_at);
    if (ms) return ms;
  }
  return null;
}

function calcularSaldosCreditos(rec) {
  const total = clampNonNegInt(rec && rec.creditos_disponiveis);
  const freeAdded = sumBy(rec && rec.historico_de_recargas, (x) => String(x.origem || "") === "free");
  const freeSpent = sumBy(rec && rec.historico_de_consumo, (x) => String(x.bucket || "") === "free");
  const freeRemaining = Math.max(0, Math.floor(toNum(freeAdded - freeSpent)));
  const free = Math.min(freeRemaining, total);
  const paid = Math.max(0, total - free);
  return { total, free, paid };
}

function calcularResumoUso(rec, nowMs = Date.now()) {
  const consumo = uniqueConsumo(Array.isArray(rec && rec.historico_de_consumo) ? rec.historico_de_consumo : []);
  const lastPaidTopupMs = encontrarUltimaRecargaPagaMs(rec);

  const todayFreeTokensUsed = sumTokens(consumo, (x) => {
    if (!x) return false;
    if (String(x.tipo || "") !== "gemini") return false;
    if (String(x.bucket || "") !== "free") return false;
    const ms = parseIsoToMs(x.created_at);
    if (!ms) return false;
    return sameUtcDay(ms, nowMs);
  });

  const totalTokensUsed = sumTokens(consumo, (x) => x && String(x.tipo || "") === "gemini");

  const sinceRechargePaidCreditsSpent = sumBy(consumo, (x) => {
    if (!x) return false;
    if (String(x.tipo || "") !== "gemini") return false;
    if (String(x.bucket || "") !== "paid") return false;
    const ms = parseIsoToMs(x.created_at);
    if (!ms) return false;
    if (!lastPaidTopupMs) return true;
    return ms >= lastPaidTopupMs;
  });

  return {
    hojeGratisTokensUsados: todayFreeTokensUsed,
    hojeGratisTokensLimite: FREE_DAILY_TOKENS,
    desdeRecargaCreditosGastos: clampNonNegInt(sinceRechargePaidCreditsSpent),
    totalHistoricoTokensUsados: totalTokensUsed
  };
}

function normalizarMetricasConsumo(metricas) {
  // Contrato de interface (UI futura): estes 4 campos alimentam o painel do botão “Créditos”.
  const m = metricas && typeof metricas === "object" ? metricas : {};
  return {
    hojeGratisTokensUsados: clampNonNegInt(m.hojeGratisTokensUsados, "hojeGratisTokensUsados"),
    hojeGratisTokensLimite: clampNonNegInt(m.hojeGratisTokensLimite, "hojeGratisTokensLimite"),
    desdeRecargaCreditosGastos: clampNonNegInt(m.desdeRecargaCreditosGastos, "desdeRecargaCreditosGastos"),
    totalHistoricoTokensUsados: clampNonNegInt(m.totalHistoricoTokensUsados, "totalHistoricoTokensUsados")
  };
}

module.exports = {
  toNum,
  clampNonNegInt,
  calcularSaldosCreditos,
  calcularResumoUso,
  normalizarMetricasConsumo,
  encontrarUltimaRecargaPagaMs,
  isPaidTopup
};
