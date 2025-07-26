async function sendMessage() {
  const input = document.getElementById("userInput").value;
  const responseDiv = document.getElementById("response");

  const assistant_id = "asst_2VvpRRLBMht994KYaFj7wO86";
  const api_key = process.env.OPENAI_API_KEY; ✅
 // Nunca deixe a API key exposta em produção pública

  responseDiv.innerHTML = "Invocando...";

  try {
    // Criar nova thread
    const threadRes = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${api_key}`,
        "Content-Type": "application/json"
      }
    });

    const threadData = await threadRes.json();
    const threadId = threadData.id;

    // Adicionar mensagem do usuário à thread
    await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        role: "user",
        content: input
      })
    });

    // Executar o assistant
    const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        assistant_id: assistant_id
      })
    });

    const runData = await runRes.json();
    const runId = runData.id;

    // Esperar a resposta da execução
    let status = "queued";
    while (status === "queued" || status === "in_progress") {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const statusRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
        headers: {
          "Authorization": `Bearer ${api_key}`
        }
      });

      const statusData = await statusRes.json();
      status = statusData.status;
    }

    // Pegar a resposta
    const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        "Authorization": `Bearer ${api_key}`
      }
    });

    const messagesData = await messagesRes.json();
    const finalMessage = messagesData.data?.[0]?.content?.[0]?.text?.value;

    responseDiv.innerHTML = finalMessage || "Sem resposta ritual.";
  } catch (error) {
    responseDiv.innerHTML = "Erro na invocação: " + error.message;
  }
}
