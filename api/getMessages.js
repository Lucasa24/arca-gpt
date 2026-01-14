import { getThreadMessages } from './memory.js';

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { threadId } = req.body;

  try {
    // Obter mensagens da memória interna
    const messages = getThreadMessages(threadId);
    
    // Filtrar mensagem de sistema e retornar apenas user/assistant
    const userMessages = messages.filter(msg => msg.role !== "system");

    res.status(200).json({ messages: userMessages });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar mensagens: " + err.message });
  }
}