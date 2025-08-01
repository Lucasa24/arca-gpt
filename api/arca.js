import { request } from "undici";

export const config = {
  runtime: "nodejs"
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Método não permitido");

  const userInput = req.body.input;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!userInput || userInput.trim() === "") {
    return res.status(400).end("Nada foi invocado.");
  }

  try {
    const { body } = await request("https://api.openai.com/v1/chat/completions", {
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
      })
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop(); // keep any partial

      for (let line of lines) {
        if (!line.startsWith("data: ")) continue;

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
          console.error("Erro ao parsear chunk:", err);
        }
      }
    }

    res.end();
  } catch (err) {
    console.error("ERRO STREAM:", err);
    res.write(`data: ⚠️ Erro: ${err.message}\n\n`);
    res.end();
  }
}
