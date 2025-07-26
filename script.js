async function sendMessage() {
  const input = document.getElementById("userInput").value;
  const responseDiv = document.getElementById("response");
  const loader = document.getElementById("loader");
  const loadingBar = document.getElementById("loadingBar");

  responseDiv.innerHTML = "Invocando...";
  loader.style.display = "block";
  loadingBar.style.width = "0%";

  // Animação simulada da barra de carregamento
  let width = 0;
  const interval = setInterval(() => {
    if (width >= 90) {
      clearInterval(interval);
    } else {
      width += 1;
      loadingBar.style.width = width + "%";
    }
  }, 25); // velocidade da animação

  try {
    const res = await fetch("/api/arca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input })
    });

    const data = await res.json();

   // Finaliza a barra
    clearInterval(interval);
    loadingBar.style.width = "100%";

// Aguarda um instante e esconde a barra
    setTimeout(() => {
      loader.style.display = "none";
      responseDiv.innerHTML = data.reply;
    }, 300);

    responseDiv.innerHTML = data.reply;
  } catch (error) {
    clearInterval(interval);
    loader.style.display = "none";
    responseDiv.innerHTML = "Erro na invocação: " + error.message;
  }
}
