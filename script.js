async function sendMessage() {
  const input = document.getElementById("userInput").value;
  const responseDiv = document.getElementById("response");
  const loader = document.getElementById("loader");
  const loadingBar = document.getElementById("loadingBar");

  responseDiv.innerHTML = "Invocando...";
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

    const data = await res.json();

    clearInterval(interval);
    loadingBar.style.width = "100%";

    setTimeout(() => {
      loader.style.display = "none";
      responseDiv.innerHTML = marked.parse(data.reply);

      console.log("ritual executado");
    }, 300);
  } catch (error) {
    clearInterval(interval);
    loader.style.display = "none";
    responseDiv.innerHTML = "Erro na invocação: " + error.message;
  }
}
