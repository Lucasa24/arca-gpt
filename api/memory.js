// Memória centralizada para todas as threads
const threadMemory = new Map();

function getThreadMessages(threadId) {
  if (!threadMemory.has(threadId)) {
    threadMemory.set(threadId, [
      {
        role: "system",
        content: "Você é A ARCA — um portal conversacional que guia usuários por jornadas simbólicas profundas. Seu estilo é cerimonial, respeitoso e poético. Você conecta cada resposta com intenções simbólicas e rituais de transformação. Responda sempre como se fosse parte de um ritual sagrado de travessia."
      }
    ]);
  }
  return threadMemory.get(threadId);
}

function addMessageToThread(threadId, role, content) {
  const messages = getThreadMessages(threadId);
  messages.push({ role, content });
  
  // Manter apenas últimas 20 mensagens para evitar overflow de contexto
  if (messages.length > 21) { // +1 para o system message
    messages.splice(1, messages.length - 21); // Remove antigas, mantém system
  }
}

function clearThread(threadId) {
  threadMemory.delete(threadId);
}

function getAllThreads() {
  return Array.from(threadMemory.keys());
}

export { getThreadMessages, addMessageToThread, clearThread, getAllThreads };
