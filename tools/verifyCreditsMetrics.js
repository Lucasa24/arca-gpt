const { calcularResumoUso, normalizarMetricasConsumo } = require("../lib/creditsMetrics.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isNum(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function mustHaveNumbers(m) {
  const keys = [
    "hojeGratisTokensUsados",
    "hojeGratisTokensLimite",
    "desdeRecargaCreditosGastos",
    "totalHistoricoTokensUsados"
  ];
  for (const k of keys) {
    assert(isNum(m[k]), `${k} não é número válido`);
    assert(m[k] >= 0, `${k} negativo`);
  }
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function run() {
  const now = Date.UTC(2026, 0, 2, 12, 0, 0);
  const yesterday = Date.UTC(2026, 0, 1, 12, 0, 0);

  {
    const rec = { historico_de_consumo: [], historico_de_recargas: [] };
    const out = normalizarMetricasConsumo(calcularResumoUso(rec, now));
    mustHaveNumbers(out);
    assert(out.hojeGratisTokensUsados === 0, "sem consumo: hojeGratisTokensUsados");
    assert(out.totalHistoricoTokensUsados === 0, "sem consumo: totalHistoricoTokensUsados");
  }

  {
    const rec = {
      historico_de_consumo: [
        { tipo: "gemini", bucket: "free", tokens: 1200, created_at: iso(now), valor: 0 },
        { tipo: "gemini", bucket: "free", tokens: 300, created_at: iso(yesterday), valor: 0 }
      ],
      historico_de_recargas: []
    };
    const out = normalizarMetricasConsumo(calcularResumoUso(rec, now));
    mustHaveNumbers(out);
    assert(out.hojeGratisTokensUsados === 1200, "free hoje não bate");
    assert(out.totalHistoricoTokensUsados === 1500, "total tokens não bate");
    assert(out.desdeRecargaCreditosGastos === 0, "desde recarga deve ser 0 sem paid");
  }

  {
    const tTopup = Date.UTC(2026, 0, 1, 10, 0, 0);
    const rec = {
      historico_de_recargas: [
        { origem: "webhook", created_at: iso(tTopup), valor: 100, bruto: { status: "approved" } }
      ],
      historico_de_consumo: [
        { tipo: "gemini", bucket: "paid", tokens: 900, valor: 7, created_at: iso(Date.UTC(2026, 0, 1, 9, 0, 0)) },
        { tipo: "gemini", bucket: "paid", tokens: 600, valor: 5, created_at: iso(Date.UTC(2026, 0, 1, 11, 0, 0)) }
      ]
    };
    const out = normalizarMetricasConsumo(calcularResumoUso(rec, now));
    mustHaveNumbers(out);
    assert(out.desdeRecargaCreditosGastos === 5, "desde recarga deve contar só pós-recarga paga");
    assert(out.totalHistoricoTokensUsados === 1500, "total tokens paid não bate");
  }

  {
    const rec = {
      historico_de_recargas: [
        { origem: "checkout", created_at: iso(Date.UTC(2026, 0, 1, 10, 0, 0)), valor: 100, provider: "pendente", status: "pending" }
      ],
      historico_de_consumo: [
        { tipo: "gemini", bucket: "paid", tokens: 300, valor: 2, created_at: iso(Date.UTC(2026, 0, 1, 11, 0, 0)) }
      ]
    };
    const out = normalizarMetricasConsumo(calcularResumoUso(rec, now));
    mustHaveNumbers(out);
    assert(out.desdeRecargaCreditosGastos === 2, "checkout pendente não pode virar recarga paga");
  }

  {
    const rec = {
      historico_de_recargas: [{ origem: "free", created_at: iso(now), valor: 30 }],
      historico_de_consumo: [
        { tipo: "gemini", bucket: "free", created_at: iso(now) },
        { tipo: "gemini", created_at: iso(now), tokens: "999" },
        { bucket: "free", tokens: 1000, created_at: iso(now) },
        { tipo: "gemini", bucket: "paid", valor: 3 }
      ]
    };
    const out = normalizarMetricasConsumo(calcularResumoUso(rec, now));
    mustHaveNumbers(out);
    assert(out.hojeGratisTokensUsados === 0, "registro sem tokens não soma");
    assert(out.totalHistoricoTokensUsados === 999, "string numérica deve virar número e contar no total");
    assert(out.desdeRecargaCreditosGastos === 0, "sem timestamp não entra no desde recarga");
  }

  {
    const rec = {
      historico_de_recargas: [],
      historico_de_consumo: [
        { tipo: "gemini", bucket: "free", tokens: 400, custoCreditos: 0, created_at: iso(now) },
        { tipo: "gemini", bucket: "paid", tokens: 100, custoCreditos: 0, created_at: iso(now) }
      ]
    };
    const out = normalizarMetricasConsumo(calcularResumoUso(rec, now));
    mustHaveNumbers(out);
    assert(out.totalHistoricoTokensUsados === 500, "custo 0 deve contar tokens no total");
    assert(out.desdeRecargaCreditosGastos === 0, "custo 0 não pode aumentar desde recarga");
  }
}

try {
  run();
  console.log("verifyCreditsMetrics: OK");
} catch (e) {
  console.error("verifyCreditsMetrics: FAIL:", e && e.message ? e.message : e);
  process.exit(1);
}

