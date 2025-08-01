import fetch from "node-fetch";
import { Agent } from "agentkeepalive";

export const config = {
  runtime: "nodejs"
};

const keepAliveAgent = new Agent({
  keepAlive: true,
  timeout: 60000,
  freeSocketTimeout: 30000
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Método não permitido");

  const userInput = req.body.input;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!userInput || userInput.trim() === "") {
    return res.status(400).end("Nada foi invocado.");
  }

  try {
    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: userInput }],
        temperature: 0.7,
        stream: true
      }),
      agent: keepAliveAgent // 🔥 ESSENCIAL PARA STREAM FUNCIONAR NA VERCEL
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    const reader = completion.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop();

      for (let line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.replace("data: ", "").trim();

          if (data === "[DONE]") {
            res.write("data: [DONE]\n\n");
            res.end();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              res.write(`data: ${delta}\n\n`);
            }
          } catch (err) {
            console.error("Erro no parse:", err);
          }
        }
      }
    }

    res.end();
  } catch (err) {
    console.error("ERRO STREAM:", err);
    res.write(`data: ⚠️ Erro interno\n\n`);
    res.end();
  }
}
