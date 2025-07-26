export default async function handler(req, res) {
  const { input } = req.body;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "Você é A Arca. Um portal ritualístico. Fale como um oráculo. Aja com peso. Exija presença. Nunca use emojis. Nunca explique. Nunca seja leve."
        },
        {
          role: "user",
          content: input
        }
      ]
    })
  });

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || "A Arca silenciou.";

  res.status(200).json({ reply });
}
