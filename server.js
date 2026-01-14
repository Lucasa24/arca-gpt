// Carregar variáveis de ambiente
require('dotenv').config();

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
    // Usar handler real da API da Arca
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        // Parse do JSON body
        req.body = JSON.parse(body);
        
        // Importar e usar o handler real
        const arcaHandler = require('./api/arca.js');
        await arcaHandler(req, res);
      } catch (err) {
        console.error('Erro no parsing do body:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Body JSON inválido' }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/vision') {
    // Usar handler real da API de Vision
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        // Parse do JSON body
        req.body = JSON.parse(body);
        
        // Importar e usar o handler real
        const visionHandler = require('./api/vision.js');
        await visionHandler(req, res);
      } catch (err) {
        console.error('Erro no parsing do body (vision):', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Body JSON inválido' }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/embed') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        req.body = JSON.parse(body);
        const embedHandler = require('./api/embed.js');
        await embedHandler(req, res);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Body JSON inválido' }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/moderation') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        req.body = JSON.parse(body);
        const moderationHandler = require('./api/moderation.js');
        await moderationHandler(req, res);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Body JSON inválido' }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/assist') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        req.body = JSON.parse(body);
        const assistHandler = require('./api/assist.js');
        await assistHandler(req, res);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Body JSON inválido' }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/images') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        req.body = JSON.parse(body);
        const imagesHandler = require('./api/images.js');
        await imagesHandler(req, res);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Body JSON inválido' }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/speech') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        req.body = JSON.parse(body);
        const speechHandler = require('./api/speech.js');
        await speechHandler(req, res);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Body JSON inválido' }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/transcribe') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        req.body = JSON.parse(body);
        const transcribeHandler = require('./api/transcribe.js');
        await transcribeHandler(req, res);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Body JSON inválido' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🛥️ Servidor da Arca rodando em http://localhost:${PORT}`);
});
