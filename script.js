async function sendMessage() {
  const input = document.getElementById("userInput").value;
  const responseDiv = document.getElementById("response");

  responseDiv.innerHTML = "Invocando...";

  try {
    const res = await fetch("/api/arca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input })
    });

    const data = await res.json();
    responseDiv.innerHTML = data.reply;
  } catch (error) {
    responseDiv.innerHTML = "Erro na invocação: " + error.message;
  }
}
