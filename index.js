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

// --- SERVER PARA O RENDER NÃO DERRUBAR (PORTA 10000) ---
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('🎙️ Podcast Olimpo Online!');
  res.end();
}).listen(port, () => console.log(`🌍 Servidor rodando na porta ${port}`));

// --- CONEXÃO MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Olimpo Conectado!"))
    .catch(err => console.error("❌ Erro Mongo:", err));

const Fofoca = mongoose.model('Fofoca', new mongoose.Schema({ 
    autor: String, 
    conteudo: String, 
    timestamp: { type: Date, default: Date.now } 
}));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ID_GRUPO = '120363405181317045@g.us';

// --- CONFIGURAÇÃO PUPPETEER (PARA LINUX/RENDER) ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
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
    console.log('--- ESCANEIE O QR CODE ABAIXO ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => console.log('🎙️ Podcast dos Deuses Pronto!'));

// --- COLETA DE CONVERSAS E ÁUDIOS ---
client.on('message', async (msg) => {
    if (msg.from === ID_GRUPO) {
        const autor = msg._data.notifyName || 'Membro';
        let texto = msg.body;

        if (msg.hasMedia && (msg.type === 'audio' || msg.type === 'ptt')) {
            try {
                const media = await msg.downloadMedia();
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const result = await model.generateContent([
                    "Resuma o que foi dito neste áudio de fofoca brevemente:", 
                    { inlineData: { data: media.data, mimeType: media.mimetype } }
                ]);
                texto = `[Áudio transcrito]: ${result.response.text()}`;
            } catch (e) { texto = "[Áudio]"; }
        }
        await Fofoca.create({ autor, conteudo: texto });
    }
});

// --- O SHOW DOS DEUSES (RICARDO E JULIA) ---
async function gerarPodcast() {
    console.log("🎬 Iniciando gravação do Podcast...");
    const fofocas = await Fofoca.find().sort({ timestamp: 1 });
    if (fofocas.length === 0) return;

    const contexto = fofocas.map(f => `${f.autor}: ${f.conteudo}`).join('\n');
    const model = genAI.getGenerativeModel({ model: "gemini-1
