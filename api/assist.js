const { fetch } = require("undici");

module.exports = async function handler(req, res) {
  try {
    const { input, assistant_id, threadId } = req.body || {};
    const api_key = process.env.OPENAI_API_KEY;
    const asst = assistant_id || process.env.ASSISTANT_ID;
    if (!api_key) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "OPENAI_API_KEY ausente" }));
    }
    if (!asst) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "ASSISTANT_ID ausente" }));
    }
    if (!input || !input.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Nada foi invocado." }));
    }

    let tid = threadId;
    if (!tid) {
      const tRes = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json", "OpenAI-Beta": "assistants=v2" }
      });
      const tJson = await tRes.json();
      tid = tJson.id;
    }

    await fetch(`https://api.openai.com/v1/threads/${tid}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json", "OpenAI-Beta": "assistants=v2" },
      body: JSON.stringify({ role: "user", content: input })
    });

    const runRes = await fetch(`https://api.openai.com/v1/threads/${tid}/runs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json", "OpenAI-Beta": "assistants=v2" },
      body: JSON.stringify({ assistant_id: asst })
    });
    const run = await runRes.json();

    let status = run.status;
    let result;
    let tries = 0;
    while ((status === "queued" || status === "in_progress") && tries < 240) {
      await new Promise(r => setTimeout(r, 1000));
      const sRes = await fetch(`https://api.openai.com/v1/threads/${tid}/runs/${run.id}`, { headers: { Authorization: `Bearer ${api_key}`, "OpenAI-Beta": "assistants=v2" } });
      result = await sRes.json();
      status = result.status;
      tries++;
    }

    const mRes = await fetch(`https://api.openai.com/v1/threads/${tid}/messages`, { headers: { Authorization: `Bearer ${api_key}`, "OpenAI-Beta": "assistants=v2" } });
    const mJson = await mRes.json();
    let text = "";
    const msg = mJson?.data?.find(m => m.role === "assistant") || mJson?.data?.[0];
    const content = msg?.content?.find(c => c.type === "text");
    text = content?.text?.value || "";

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ threadId: tid, status, reply: text }));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}
