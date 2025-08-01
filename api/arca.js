// Exemplo com streaming real
const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${api_key}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "gpt-4", // ou outro compatível
    messages: [{ role: "user", content: userInput }],
    stream: true
  })
});
