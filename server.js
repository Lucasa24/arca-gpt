// Carregar dotenv apenas em desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    // Servir o index.html
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Erro interno do servidor');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.method === 'GET' && req.url === '/favicon.ico') {
    // Servir o favicon
    fs.readFile(path.join(__dirname, 'favicon.ico'), (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/x-icon' });
      res.end(data);
    });
  } else if (req.method === 'POST' && req.url === '/api/thread') {
    // Mock da API de thread
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ threadId: 'thread_' + Date.now() }));
  } else if (req.method === 'POST' && req.url === '/api/arca') {
    // Mock da API da Arca
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const { input } = JSON.parse(body);
      
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      
      // Simular resposta streaming
      const response = `🌊 **Resposta da Arca para:** "${input}"\n\nA Arca ecoa suas palavras através das águas místicas. Esta é uma resposta de teste para demonstrar as funcionalidades implementadas:\n\n- ✅ **Confirmação no Reset**: Agora você precisa confirmar antes de perder a conversa\n- ✅ **Sidebar de Sessões**: Lista lateral com histórico de conversas\n- ✅ **Nova Travessia**: Botão para iniciar nova sessão\n- ✅ **Navegação entre Threads**: Clique nas sessões para alternar\n\n*As águas da memória agora fluem de forma organizada...*`;
      
      const words = response.split(' ');
      let index = 0;
      
      const interval = setInterval(() => {
        if (index < words.length) {
          res.write(`data: ${words[index]} `);
          index++;
        } else {
          res.write('data: [DONE]');
          res.end();
          clearInterval(interval);
        }
      }, 100);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = process.env.PORT || 3000;

// Para desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log(`🛥️ Servidor da Arca rodando em http://localhost:${PORT}`);
  });
}

// Export para Vercel
module.exports = server;
