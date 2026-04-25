const { criarCheckoutCredito, confirmarPagamentoWebhook, getOrCreateCredits } = require("../lib/credits.js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Webhook-Secret, X-Payment-Webhook-Secret");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    return res.end();
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  try {
    const body = req.body || {};
    const action = String(body.action || "get").toLowerCase();

    if (action === "create_checkout") {
      const userId = body.userId;
      const valor = body.valor;
      const out = await criarCheckoutCredito(userId, valor);
      if (!out.ok) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: out.error || "Falha ao criar checkout" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(out));
    }

    if (action === "webhook_confirm") {
      const headers = Object.fromEntries(Object.entries(req.headers || {}).map(([k, v]) => [String(k).toLowerCase(), v]));
      const out = await confirmarPagamentoWebhook(body.evento || body.event || body, headers);
      if (!out.ok) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: out.error || "Falha no webhook" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, message: out.mensagem || "Créditos adicionados com sucesso." }));
    }

    if (action === "get") {
      const userId = body.userId;
      const authHeader = req.headers["authorization"];
      const rec = await getOrCreateCredits(userId, authHeader);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        creditosDisponiveis: rec ? Number(rec.creditos_disponiveis || 0) : 0,
        creditosGastos: rec ? Number(rec.creditos_gastos || 0) : 0,
        historicoDeRecargas: rec ? rec.historico_de_recargas || [] : [],
        historicoDeConsumo: rec ? rec.historico_de_consumo || [] : []
      }));
    }

    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "action inválida" }));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message || "Erro interno" }));
  }
};

