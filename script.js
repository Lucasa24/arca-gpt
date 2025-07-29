async function sendMessage() {
  const input = document.getElementById("userInput").value;
  const responseDiv = document.getElementById("response");
  const loader = document.getElementById("loader");
  const loadingBar = document.getElementById("loadingBar");

  responseDiv.innerHTML = "";
  loader.style.display = "block";
  loadingBar.style.width = "0%";

  let width = 0;
  const interval = setInterval(() => {
    if (width >= 90) {
      clearInterval(interval);
    } else {
      width += 1;
      loadingBar.style.width = width + "%";
    }
  }, 25);

  try {
    const res = await fetch("/api/arca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input })
    });

    if (!res.body) {
      throw new Error("Resposta vazia");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    clearInterval(interval);
    loadingBar.style.width = "100%";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop();

      for (const part of parts) {
        if (part.startsWith("data: ")) {
          const content = part.slice(6);
          if (content === "[DONE]") {
            loader.style.display = "none";
            return;
          }

          responseDiv.innerHTML += content;
        }
      }
    }

    loader.style.display = "none";
  } catch (error) {
    clearInterval(interval);
    loader.style.display = "none";
    responseDiv.innerHTML = "Erro na invocação: " + error.message;
  }
}