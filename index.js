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

// --- SERVER PARA O RAILWAY NÃO DERRUBAR ---
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('🎙️ Olimpo Online no Railway!');
}).listen(port);

// --- CONEXÃO MONGODB ---
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Banco de Dados Conectado!"));
const Fofoca = mongoose.model('Fofoca', new mongoose.Schema({ 
    autor: String, conteudo: String, timestamp: { type: Date, default: Date.now } 
}));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ID_GRUPO = '120363405181317045@g.us';

// --- CONFIGURAÇÃO PARA RAILWAY (DOCKER) ---
const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 240000, // 4 minutos para conectar
    puppeteer: {
        executablePath: '/usr/bin/google-chrome-stable', // Caminho padrão no Docker do Puppeteer
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('\n\n--- ESCANEIE ESTE QR CODE NO RAILWAY ---');
    qrcode.generate(qr, { small: false });
    console.log('\n---------------------------------------\n');
});

client.on('ready', () => console.log('🚀 BOT ONLINE E BRABO! Boa noite, Caio.'));

client.on('message', async (msg) => {
    if (msg.from === ID_GRUPO) {
        const autor = msg._data.notifyName || 'Membro';
        let texto = msg.body;
        if (msg.hasMedia && (msg.type
