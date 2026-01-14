// Gerar ID único para thread local
function generateThreadId() {
  return 'thread_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    // Gerar threadId local (não precisa mais da OpenAI)
    const threadId = generateThreadId();
    
    res.status(200).json({ threadId });
  } catch (err) {
    console.error("Erro ao criar thread:", err);
    res.status(500).json({ error: "Falha ao criar thread" });
  }
}