<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script>
async function sendMessage() {
  const input = document.getElementById("userInput").value;
  const responseDiv = document.getElementById("response");
  const loader = document.getElementById("loader");
  const loadingBar = document.getElementById("loadingBar");

  responseDiv.innerHTML = "Invocando...";
  loader.style.display = "block";
  loadingBar.style.width = "0%";

  let progress = 0;
  const interval = setInterval(() => {
    if (progress < 95) {
      progress += 1;
      loadingBar.style.width = progress + "%";
    }
  }, 35);

  try {
    const res = await fetch("/api/arca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input })
    });

    const data = await res.json();
    clearInterval(interval);
    loadingBar.style.width = "100%";

    setTimeout(() => {
      loader.style.display = "none";
      responseDiv.innerHTML = marked.parse(data.reply || "⚠️ A Arca silenciou...");
    }, 300);
  } catch (err) {
    clearInterval(interval);
    loader.style.display = "none";
    responseDiv.innerHTML = "⚠️ A Arca falhou: " + err.message;
  }
}

window.sendMessage = sendMessage;
</script>
