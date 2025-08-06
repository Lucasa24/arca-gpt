// Carregar dotenv apenas em desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const http = require('http');
const fs = require('fs');
const path = require('path');

// Importar a API real da Arca
const arcaHandler = require('./api/arca.js');

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
    // Chamar a API real da Arca
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        // Criar objeto de requisição mock
        const mockReq = {
          method: 'POST',
          body: JSON.parse(body)
        };
        
        // Chamar o handler real da Arca
        await arcaHandler(mockReq, res);
      } catch (error) {
        console.error('Erro na API da Arca:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Erro interno do servidor' }));
      }
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
