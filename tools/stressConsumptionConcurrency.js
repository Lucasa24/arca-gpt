const { registrarConsumo, getOrCreateCredits } = require("../lib/credits.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const userId = `stress_${Date.now()}@local`;
  const consumptionId = `race_${Date.now()}`;

  await Promise.all(
    Array.from({ length: 5 }).map(() =>
      registrarConsumo(
        userId,
        {
          tipo: "gemini",
          bucket: "free",
          tokens: 123,
          custoCreditos: 0,
          consumption_id: consumptionId
        },
        null
      )
    )
  );

  const rec = await getOrCreateCredits(userId, null);
  const list = Array.isArray(rec && rec.historico_de_consumo) ? rec.historico_de_consumo : [];
  const matches = list.filter((x) => x && String(x.consumption_id || "") === consumptionId);
  assert(matches.length === 1, `esperado 1 evento, obtido ${matches.length}`);
  console.log("stressConsumptionConcurrency: OK");
}

run().catch((e) => {
  console.error("stressConsumptionConcurrency: FAIL:", e && e.message ? e.message : e);
  process.exit(1);
});

