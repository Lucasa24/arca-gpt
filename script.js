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
  }, 30);

  const eventSource = new EventSource("/api/arca-stream?input=" + encodeURIComponent(input));
  let result = "";

  eventSource.onmessage = function (event) {
    result += event.data;
    responseDiv.innerHTML = result;
  };

  eventSource.onerror = function () {
    clearInterval(interval);
    loadingBar.style.width = "100%";
    setTimeout(() => {
      loader.style.display = "none";
    }, 500);
    eventSource.close();
  };

  eventSource.addEventListener("done", () => {
    clearInterval(interval);
    loadingBar.style.width = "100%";
    setTimeout(() => {
      loader.style.display = "none";
    }, 500);
    eventSource.close();
    console.log("ritual executado");
  });
}
