<script type="module">
  import { EventSourcePolyfill } from "https://cdn.skypack.dev/event-source-polyfill";
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
      if (progress < 90) {
        progress += 1;
        loadingBar.style.width = progress + "%";
      }
    }, 35);

    const eventSource = new EventSourcePolyfill("/api/arca", {
      headers: { "Content-Type": "application/json" },
      payload: JSON.stringify({ input }),
      method: "POST"
    });

    let rawData = "";

    eventSource.onmessage = (event) => {
      if (event.data === "[DONE]") {
        clearInterval(interval);
        loader.style.display = "none";
        loadingBar.style.width = "100%";
        eventSource.close();
        responseDiv.innerHTML = marked.parse(rawData);
      } else {
        if (responseDiv.innerHTML === "Invocando...") rawData = "";
        rawData += event.data;
      }
    };

    eventSource.onerror = (error) => {
      clearInterval(interval);
      loader.style.display = "none";
      eventSource.close();
      responseDiv.innerHTML = "⚠️ A Arca silenciou: " + error.message;
    };
  }

  window.sendMessage = sendMessage;
</script>
