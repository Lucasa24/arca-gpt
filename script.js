<script type="module">
import { EventSourcePolyfill } from 'event-source-polyfill';

async function sendMessage() {
  const input = document.getElementById("userInput").value;
  const responseDiv = document.getElementById("response");
  const loader = document.getElementById("loader");
  const loadingBar = document.getElementById("loadingBar");

  responseDiv.innerHTML = "Invocando...";
  loader.style.display = "block";
  loadingBar.style.width = "0%";

// Simula início da barra de carregamento
  let progress = 0;
  const interval = setInterval(() => {
    if (progress < 90) {
      progress += 1;
      loadingBar.style.width = progress + "%";
    }
  }, 30);

const eventSource = new EventSourcePolyfill("/api/arca", {
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify({ input }),
    method: "POST"
  });

eventSource.onmessage = (event) => {
    // Recebe fragmentos e mostra ao vivo
    responseDiv.innerHTML += event.data;
    responseDiv.scrollTop = responseDiv.scrollHeight;
    loadingBar.style.width = "100%";
  };

function sendMessage() {
  const input = document.getElementById("userInput").value;
  const responseDiv = document.getElementById("response");
  const loadingBar = document.getElementById("loadingBar");

  responseDiv.innerHTML = ""; // limpa resposta
  loadingBar.style.width = "0%";
  loadingBar.style.display = "block";

  eventSource.onmessage = (event) => {
    responseDiv.innerHTML += event.data;
    loadingBar.style.width = "100%";
  };

  eventSource.onerror = (err) => {
    console.error("Erro no stream:", err);
    loadingBar.style.display = "none";
    eventSource.close();
  };

  eventSource.addEventListener("done", () => {
    eventSource.close();
    loadingBar.style.display = "none";
  });
}

  let progress = 0;
  const loadingInterval = setInterval(() => {
    if (progress < 95) {
      progress += 1;
      loadingBar.style.width = progress + "%";
    }
  }, 50); // mais lento e gradual

  try {
    const res = await fetch("/api/arca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input })
    });

    const data = await res.json();

    clearInterval(loadingInterval);
    loadingBar.style.width = "100%";

    setTimeout(() => {
      loader.style.display = "none";
      responseDiv.innerHTML = marked.parse(data.reply);
    }, 300); // pequena pausa após o final
  } catch (error) {
    clearInterval(loadingInterval);
    loader.style.display = "none";
    responseDiv.innerHTML = "Erro na invocação: " + error.message;
  }
}

window.sendMessage = sendMessage;
</script>
