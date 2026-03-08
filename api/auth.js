const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- SISTEMA DE E-MAIL HÍBRIDO (SUPABASE / RESEND) ---
async function sendWelcomeEmail(email) {
  try {
    // 1. Prioridade: Resend (Se a chave estiver na Vercel)
    if (process.env.RESEND_API_KEY) {
      console.log("[ARCA MAIL] Tentando via Resend...");
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'Arca <onboarding@resend.dev>', // Mudar para seu domínio quando tiver
          to: [email],
          subject: 'Bem-vindo à Arca',
          html: '<strong>Você agora faz parte da Arca.</strong><p>O ritual começou. Acesse sua conta para continuar.</p>'
        })
      });
      if (res.ok) return { success: true, provider: 'resend' };
    }

    // 2. Fallback: Supabase Auth (Se configurado)
    if (supabase) {
      console.log("[ARCA MAIL] Tentando via Supabase Auth...");
      // O Supabase envia e-mail de confirmação automaticamente se configurado no painel
      // Aqui apenas disparamos um link de "magic link" ou reset para testar o SMTP
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: 'https://arca-gpt.vercel.app/' }
      });
      if (!error) return { success: true, provider: 'supabase' };
    }
  } catch (e) {
    console.warn("[ARCA MAIL] Falha ao enviar e-mail:", e.message);
  }
  return { success: false };
}

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
      .from('users')
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
    const { data, error } = await supabase
      .from('users')
      .insert([userData])
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
    const { action, email, password, access_token } = req.body;

    // Actions que não requerem email/senha
    if (action === 'get_google_url') {
      if (!supabase) {
        throw new Error("Login com Google indisponível (Supabase não configurado).");
      }
      
      // Tenta detectar a URL de origem, fallback para a produção
      const origin = req.headers.origin || "https://arca-gpt.vercel.app";
      const redirectUrl = `${origin}/`;
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
      return res.end(JSON.stringify({ url: data.url }));
    }

    if (action === 'reset_password') {
      if (!supabase) throw new Error("Supabase indisponível.");
      if (!email) throw new Error("E-mail é obrigatório.");

      // Detecta a origem para o link de redirecionamento
      const origin = req.headers.origin || "https://arca-gpt.vercel.app";
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/#type=recovery`,
      });

      if (error) throw error;

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ 
        success: true, 
        message: "E-mail de recuperação enviado! Verifique sua caixa de entrada.",
        ritual_message: "O ritual de renovação foi enviado às sombras do seu e-mail. Encontre a chave e retorne."
      }));
    }

    if (action === 'update_password') {
      if (!supabase) throw new Error("Supabase indisponível.");
      if (!access_token || !password) throw new Error("Token e nova senha são obrigatórios.");

      // O Supabase permite atualizar o usuário autenticado via token
      const { data, error } = await supabase.auth.updateUser({ password }, {
        accessToken: access_token
      });

      if (error) throw error;

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ 
        success: true, 
        message: "Senha atualizada com sucesso! Agora você pode entrar." 
      }));
    }

    if (action === 'verify_token') {
      if (!supabase) throw new Error("Supabase indisponível.");
      if (!access_token) throw new Error("Token ausente.");

      const { data: { user }, error } = await supabase.auth.getUser(access_token);
      
      if (error || !user) throw new Error("Token inválido ou expirado.");

      // Verifica se o usuário já existe na nossa tabela 'users' customizada (sincronia)
      // O Supabase Auth cria no 'auth.users', mas nós usamos 'public.users' ou fallback
      // Vamos garantir que ele exista no nosso registro local/public
      
      let localUser = await findUserByEmail(user.email);
      
      if (!localUser) {
        // Cria usuário localmente baseado no Google
        localUser = {
          id: user.id,
          email: user.email,
          password: crypto.randomUUID(), // Senha aleatória, pois é login social
          created_at: new Date().toISOString(),
          is_pro: false,
          provider: 'google'
        };
        await createUser(localUser);
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ 
        success: true, 
        user: { id: localUser.id, email: localUser.email, isPro: localUser.is_pro },
        message: "Login com Google realizado com sucesso."
      }));
    }

    if (!email || !password) {
      throw new Error("Email e senha são obrigatórios.");
    }

    // Ação 1: CADASTRO (Sign Up)
    if (action === 'signup') {
      const existingUser = await findUserByEmail(email);
      if (existingUser) {
        throw new Error("Este email já está cadastrado.");
      }

      const newUser = {
        id: crypto.randomUUID(),
        email,
        password, // TODO: Hash em produção real
        created_at: new Date().toISOString(),
        is_pro: false
      };

      const savedUser = await createUser(newUser);

      // Dispara e-mail de boas-vindas (em background, sem travar o cadastro)
      sendWelcomeEmail(email).catch(e => console.error("[ARCA] Erro e-mail cadastro:", e.message));

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ 
        success: true, 
        user: { id: savedUser.id, email: savedUser.email, isPro: savedUser.is_pro },
        message: "Conta criada com sucesso! Bem-vindo à Arca."
      }));
    }

    // Ação 2: LOGIN (Sign In)
    if (action === 'login') {
      const user = await findUserByEmail(email);

      if (!user || user.password !== password) {
        throw new Error("Email ou senha incorretos.");
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ 
        success: true, 
        user: { id: user.id, email: user.email, isPro: user.is_pro },
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
