require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const cron = require('node-cron');
const mongoose = require('mongoose');
const http = require('http');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

// --- SERVER PARA MANTER O RAILWAY VIVO ---
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('🎙️ Olimpo Online Ativo! - Atreus & Isis');
}).listen(port, '0.0.0.0');

// --- CONEXÃO MONGODB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Banco de Dados Conectado!"))
  .catch(err => console.error("❌ Erro no MongoDB:", err));

const Fofoca = mongoose.model('Fofoca', new mongoose.Schema({
  autor: String,
  conteudo: String,
  timestamp: { type: Date, default: Date.now }
}));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ID_GRUPO = '120363405181317045@g.us';

// --- CONFIGURAÇÃO PUPPETEER CORRIGIDA PARA RAILWAY ---
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: '/usr/bin/google-chrome-stable',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ],
  }
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('✨ Escaneie o QR Code acima para iniciar Atreus e Isis');
});

client.on('ready', () => {
  console.log('🚀 Atreus e Isis estão online!');
});

// Captura de mensagens para o podcast
client.on('message', async msg => {
  if (msg.from === ID_GRUPO && !msg.fromMe) {
    try {
      await Fofoca.create({ autor: msg.pushname || 'Anônimo', conteudo: msg.body });
    } catch (err) {
      console.error("Erro ao salvar fofoca:", err);
    }
  }
});

client.initialize();
