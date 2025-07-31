<script type="module">
import { EventSourcePolyfill } from "https://cdn.skypack.dev/event-source-polyfill";

async function sendMessage() {
  const input = document.getElementById("userInput").value;
  const responseDiv = document.getElementById("response");
  const loader = document.getElementById("loader");
  const loadingBar = document.getElementById("loadingBar");

  responseDiv.innerHTML = "Invocando...";
  loader.style.display = "block";
  loadingBar.style.width = "0%";

  // Barra de carregamento visual
  let progress = 0;
  const interval = setInterval(() => {
    if (progress < 90) {
      progress += 1;
      loadingBar.style.width = progress + "%";
    }
  }, 30);

  // Invocação via streaming SSE
  const eventSource = new EventSourcePolyfill("/api/arca", {
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify({ input }),
    method: "POST"
  });

  eventSource.onmessage = (event) => {
    if (event.data === "[DONE]") {
      clearInterval(interval);
      loader.style.display = "none";
      eventSource.close();
    } else {
      if (responseDiv.innerHTML === "Invocando...") responseDiv.innerHTML = "";
      responseDiv.innerHTML += event.data;
      loadingBar.style.width = "100%";
    }
  };

  eventSource.onerror = (error) => {
    clearInterval(interval);
    loader.style.display = "none";
    responseDiv.innerHTML = "⚠️ A Arca silenciou: " + error.message;
    eventSource.close();
  };

  eventSource.addEventListener("done", () => {
    clearInterval(interval);
    loader.style.display = "none";
    eventSource.close();
  });
}

window.sendMessage = sendMessage;
</script>
