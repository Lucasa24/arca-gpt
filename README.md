# 🛥️ ARCA - Portal Conversacional

## 🚀 Deploy no Vercel

### 1. **Configurar Variáveis de Ambiente no Vercel**

No painel do Vercel:
1. Vá em **Settings** → **Environment Variables**
2. Adicione:
   - `OPENAI_API_KEY`: Sua chave da OpenAI
   - `NODE_ENV`: `production`

### 2. **Deploy**

```bash
# Instalar Vercel CLI (se não tiver)
npm i -g vercel

# Deploy
vercel
```

### 3. **Desenvolvimento Local**

```bash
# Instalar dependências
npm install

# Rodar localmente
node server.js
```

## 📁 Estrutura

- `server.js` - Servidor principal (compatível com Vercel)
- `api/` - Endpoints da API
- `vercel.json` - Configuração do Vercel
- `.env` - Variáveis locais (não commitado)

## ⚡ Funcionalidades

- ✅ Streaming em tempo real
- ✅ Memória persistente por thread
- ✅ Interface conversacional
- ✅ Deploy automático no Vercel

---

**A Arca está pronta para a travessia digital.**