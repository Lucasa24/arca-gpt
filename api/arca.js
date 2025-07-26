export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const userInput = req.body.input;

  const assistant_id = process.env.ASSISTANT_ID;
  const api_key = process.env.OPENAI_API_KEY;

  try {
    const threadRes = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json"
      }
    });
    const thread = await threadRes.json();
    const threadId = thread.id;

    await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${api_key}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    assistant_id // <-- sem hardcode, com ID vindo do env
  })
});

    const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        assistant_id
      })
    });
    const run = await runRes.json();

    let status = "queued";
    let result;
    while (status === "queued" || status === "in_progress") {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const statusRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${run.id}`, {
        headers: {
          Authorization: `Bearer ${api_key}`
        }
      });
      result = await statusRes.json();
      status = result.status;
    }

    const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        Authorization: `Bearer ${api_key}`
      }
    });
    const messagesData = await messagesRes.json();
    const finalMessage = messagesData.data?.[0]?.content?.[0]?.text?.value;

console.log("Mensagens da Arca:", JSON.stringify(messagesData, null, 2));

    res.status(200).json({ reply: finalMessage || "Sem resposta ritual." });
  } catch (error) {
    res.status(500).json({ error: "Erro ao invocar a Arca: " + error.message });
  }
}
