export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const userInput = req.body.input;

  const response = await fetch("https://api.openai.com/v1/assistants/COLOQUE_SEU_ASSISTANT_ID/threads", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: userInput }]
    })
  });

  const data = await response.json();

  res.status(200).json({
    reply: data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2)
  });
}
