const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { criarCheckoutCredito, confirmarPagamentoWebhook, getOrCreateCredits, calcularSaldosCreditos, adicionarCreditos, debitarCreditos, registrarConsumo } = require('../lib/credits.js');

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret, X-Payment-Webhook-Secret');

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

    const internalSecret = process.env.INTERNAL_API_SECRET;
    const gotInternal = req.headers["x-internal-secret"];
    const internalOk = internalSecret && String(gotInternal || "") === String(internalSecret);

    if (action === 'credits_get' || action === 'consultarCreditos') {
      const userId = req.body && req.body.userId;
      const rec = await getOrCreateCredits(userId, req.headers['authorization']);
      const saldos = rec ? calcularSaldosCreditos(rec) : { total: 0, free: 0, paid: 0 };
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        creditosDisponiveis: saldos.total,
        creditosGratisDisponiveis: saldos.free,
        creditosPagosDisponiveis: saldos.paid,
        creditosGastos: rec ? Number(rec.creditos_gastos || 0) : 0,
        historicoDeRecargas: rec ? rec.historico_de_recargas || [] : [],
        historicoDeConsumo: rec ? rec.historico_de_consumo || [] : []
      }));
    }

    if (action === 'credits_create_checkout' || action === 'criarCheckoutCredito') {
      const userId = req.body && req.body.userId;
      const valor = req.body && req.body.valor;
      const out = await criarCheckoutCredito(userId, valor);
      if (!out.ok) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: out.error || "Falha ao criar checkout" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(out));
    }

    if (action === 'credits_webhook_confirm' || action === 'confirmarPagamentoWebhook') {
      const headers = Object.fromEntries(Object.entries(req.headers || {}).map(([k, v]) => [String(k).toLowerCase(), v]));
      const out = await confirmarPagamentoWebhook(req.body && (req.body.evento || req.body.event || req.body), headers);
      if (!out.ok) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: out.error || "Falha no webhook" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, message: out.mensagem || "Créditos adicionados com sucesso." }));
    }

    if (action === 'adicionarCreditos') {
      if (!internalOk) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "forbidden" }));
      }
      const out = await adicionarCreditos(req.body && req.body.userId, req.body && req.body.valor, req.body && (req.body.meta || {}), req.headers['authorization']);
      if (!out.ok) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: out.error || "Falha ao adicionar créditos" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, message: "Créditos adicionados com sucesso." }));
    }

    if (action === 'debitarCreditos') {
      if (!internalOk) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "forbidden" }));
      }
      const out = await debitarCreditos(req.body && req.body.userId, req.body && req.body.valor, req.body && (req.body.dados || {}), req.headers['authorization']);
      if (!out.ok) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: out.error || "Falha ao debitar créditos" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true }));
    }

    if (action === 'registrarConsumo') {
      if (!internalOk) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "forbidden" }));
      }
      const out = await registrarConsumo(req.body && req.body.userId, req.body && (req.body.dados || {}), req.headers['authorization']);
      if (!out.ok) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: out.error || "Falha ao registrar consumo" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true }));
    }

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

    if (action === 'signup' || action === 'login') {
      if (!supabase) throw new Error("Supabase indisponível.");
      if (!email || !password) throw new Error("Email e senha são obrigatórios.");

      const origin = req.headers.origin || "https://arca-gpt.vercel.app";

      if (action === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${origin}/` }
        });
        if (error) throw error;

        // Sincroniza registro básico em public.users (não bloqueante)
        try {
          let localUser = await findUserByEmail(email);
          if (!localUser) {
            await createUser({
              id: (data.user && data.user.id) || crypto.randomUUID(),
              email,
              password: crypto.randomUUID(),
              created_at: new Date().toISOString(),
              is_pro: false,
              provider: 'email'
            });
          }
        } catch {}

        const needsConfirm = !(data.session && data.session.access_token);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: true,
          requires_confirmation: needsConfirm,
          access_token: data.session ? data.session.access_token : null,
          user: data.user ? { id: data.user.id, email: data.user.email, isPro: false } : { email, isPro: false },
          message: needsConfirm ? "Confirme seu e-mail para concluir o cadastro." : "Conta criada e sessão iniciada."
        }));
      }

      if (action === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const token = data.session && data.session.access_token;

        // Sincroniza registro básico em public.users (não bloqueante)
        try {
          let localUser = await findUserByEmail(email);
          if (!localUser) {
            await createUser({
              id: data.user.id,
              email: data.user.email,
              password: crypto.randomUUID(),
              created_at: new Date().toISOString(),
              is_pro: false,
              provider: 'email'
            });
          }
        } catch {}

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: true,
          access_token: token,
          user: { id: data.user.id, email: data.user.email, isPro: false },
          message: "Login realizado com sucesso."
        }));
      }
    }
    
    throw new Error("Ação inválida.");

  } catch (error) {
    console.error("[ARCA AUTH ERROR]", error);
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: error.message }));
  }
};
