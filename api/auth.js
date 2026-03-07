const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Tenta carregar Supabase (se instalado e configurado)
let supabase;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    console.log("[ARCA AUTH] Usando Supabase");
  }
} catch (e) {
  console.warn("[ARCA AUTH] Supabase client não disponível:", e.message);
}

// Fallback: Memória (Volátil na Vercel se não tiver Supabase)
let MEMORY_USERS = [];
const DB_PATH = path.join(__dirname, '../database/users.json');

// --- HELPERS DE PERSISTÊNCIA ---

async function findUserByEmail(email) {
  // 1. Tenta Supabase
  if (supabase) {
      const { data, error } = await supabase
        .from('userslogin')
        .select('*')
        .eq('email', email)
        .single();
      if (error && error.code !== 'PGRST116') console.error("Supabase Error:", error);
      return data;
    }

  // 2. Tenta Local (users.json)
  try {
    if (fs.existsSync(DB_PATH)) {
      const content = fs.readFileSync(DB_PATH, 'utf8');
      const json = JSON.parse(content);
      const user = json.users.find(u => u.email === email);
      if (user) return user;
    }
  } catch (e) {}

  // 3. Tenta Memória
  return MEMORY_USERS.find(u => u.email === email);
}

async function createUser(userData) {
  // 1. Tenta Supabase
  if (supabase) {
      // Verifica se já existe
      const { data: existingUser } = await supabase
        .from('userslogin')
        .select('*')
        .eq('email', userData.email)
        .single();
      
      if (existingUser) {
        throw new Error("E-mail já cadastrado.");
      }

      const { data, error } = await supabase
        .from('userslogin')
        .insert([{ ...userData, active_thread_id: userData.threadId || null }]) // Salva threadId inicial
        .select()
        .single();
      
      if (error) throw new Error("Erro ao salvar no Supabase: " + error.message);
      return data;
    }

  // 2. Tenta Local e Memória
  MEMORY_USERS.push(userData);
  
  try {
    // Tenta persistir em disco (pode falhar na Vercel)
    let allUsers = [];
    if (fs.existsSync(DB_PATH)) {
      const content = fs.readFileSync(DB_PATH, 'utf8');
      const json = JSON.parse(content);
      allUsers = json.users || [];
    }
    allUsers.push(userData);
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: allUsers }, null, 2));
  } catch (e) {
    console.warn("[ARCA AUTH] Falha ao salvar em disco (ambiente read-only?):", e.message);
  }

  return userData;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  try {
    const { action, email, password } = req.body;

    if (!email || !password) {
      throw new Error("Email e senha são obrigatórios.");
    }

    // Ação 1: CADASTRO (Sign Up)
    if (action === 'signup') {
      const { email, password, threadId } = req.body; // Recebe threadId do front
      if (!email || !password) throw new Error("E-mail e senha obrigatórios.");
      
      const existing = await findUserByEmail(email);
      if (existing) throw new Error("E-mail já cadastrado.");

      const id = crypto.randomUUID();
      // Em produção, use bcrypt para hashear a senha!
      const user = await createUser({ id, email, password, is_pro: false, threadId });
      
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ 
        success: true, 
        user: { id: user.id, email: user.email, isPro: user.is_pro, threadId: user.active_thread_id },
        message: "Cadastro realizado com sucesso."
      }));
    }

    // Ação 2: LOGIN (Sign In)
    if (action === 'login') {
      const { email, password, threadId } = req.body; // Recebe threadId atual do front (opcional)
      if (!email || !password) throw new Error("E-mail e senha obrigatórios.");

      const user = await findUserByEmail(email);
      if (!user) throw new Error("Usuário não encontrado.");
      if (user.password !== password) throw new Error("Senha incorreta.");
      
      // Lógica de Sincronização de Thread (PC <-> Celular)
      let finalThreadId = user.active_thread_id;
      
      // Se o usuário não tem thread salva, usa a atual e salva
      if (!finalThreadId && threadId) {
        finalThreadId = threadId;
        if (supabase) {
           await supabase.from('userslogin').update({ active_thread_id: threadId }).eq('id', user.id);
        }
      }
      
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ 
        success: true, 
        user: { id: user.id, email: user.email, isPro: user.is_pro, threadId: finalThreadId },
        message: "Login realizado com sucesso."
      }));
    }
    
    throw new Error("Ação inválida.");

  } catch (error) {
    console.error("[ARCA AUTH ERROR]", error);
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: error.message }));
  }
};
