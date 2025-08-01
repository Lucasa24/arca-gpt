<script type="module">
  import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

  async function sendMessage() {
  const input = document.getElementById("userInput").value.trim();
  const responseDiv = document.getElementById("response");
  const loader = document.getElementById("loader");
  const loadingBar = document.getElementById("loadingBar");

  if (!input) {
    responseDiv.innerHTML = "⚠️ Nada foi invocado.";
    return;
  }

  responseDiv.innerHTML = "Invocando...";
  loader.style.display = "block";
  loadingBar.style.width = "0%";

  let progress = 0;
  const interval = setInterval(() => {
    if (progress < 95) {
      progress += 1;
      loadingBar.style.width = progress + "%";
    }
  }, 30);

  const response = await fetch("/api/arca", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    clearInterval(interval);
    loader.style.display = "none";
    responseDiv.innerHTML = "⚠️ A Arca silenciou... " + response.statusText;
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let rawData = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    rawData += chunk;
    responseDiv.innerHTML = rawData;
  }

  clearInterval(interval);
  loader.style.display = "none";
  loadingBar.style.width = "100%";
        responseDiv.innerHTML = marked.parse(rawData);
        eventSource.close();
        return;
      }

      if (responseDiv.innerHTML === "Invocando...") rawData = "";
      rawData += event.data;
    };

    eventSource.onerror = (err) => {
      clearInterval(interval);
      loader.style.display = "none";
      eventSource.close();
      responseDiv.innerHTML = "⚠️ A Arca silenciou: " + err.message;
    };
  }

  window.sendMessage = sendMessage;
</script>
