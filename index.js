require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const mongoose = require('mongoose');
const http = require('http');
const fs = require('fs');

// --- SERVER PARA MANTER O RAILWAY VIVO ---
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('🎙️ Olimpo Online: Atreus & Isis no ar!');
}).listen(process.env.PORT || 10000);

// --- CONEXÃO MONGODB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Banco Conectado!"))
  .catch(err => console.error("❌ Erro Mongo:", err));

const Fofoca = mongoose.model('Fofoca', new mongoose.Schema({
  autor: String,
  conteudo: String,
  timestamp: { type: Date, default: Date.now }
}));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ID_GRUPO = '120363405181317045@g.us';

// --- CONFIGURAÇÃO PUPPETEER PARA RAILWAY (DOCKER) ---
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: '/usr/bin/google-chrome-stable',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--disable-gpu'
    ],
  }
});

client.on('qr', qr => {
  console.log('✨ ESCANEIE O QR CODE PARA ATIVAR ATREUS E ISIS:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('🚀 ATREUS E ISIS PRONTOS PARA O DEBOCHE!');
});

// Captura de mensagens do grupo
client.on('message', async msg => {
  if (msg.from === ID_GRUPO && !msg.fromMe) {
    try {
      await Fofoca.create({ 
        autor: msg._data.notifyName || 'Membro do Olimpo', 
        conteudo: msg.body 
      });
    } catch (err) {
      console.error("Erro ao salvar fofoca:", err);
    }
  }
});

// Função para gerar o podcast debochado
async function produzirPodcast() {
  const fofocas = await Fofoca.find().sort({ timestamp: 1 });
  if (fofocas.length < 2) return;

  const contexto = fofocas.map(f => `${f.autor}: ${f.conteudo}`).join('\n');
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const prompt = `Você é uma dupla de apresentadores de podcast: Atreus (homem muito debochado e ranzinza) e Isis (mulher irônica e fofoqueira). Criem um roteiro curto e engraçado comentando estas fofocas do grupo Olimpo: ${contexto}`;
    const result = await model.generateContent(prompt);
    const roteiro = result.response.text();

    // ElevenLabs - Voz da Isis (ID de exemplo feminino)
    const response = await axios.post(
      'https://api.elevenlabs.
