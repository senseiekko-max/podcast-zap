require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const mongoose = require('mongoose');
const http = require('http');
const fs = require('fs');

// Server para o Railway não desligar
http.createServer((req, res) => { 
    res.writeHead(200);
    res.end('🎙️ Atreus & Isis Online'); 
}).listen(process.env.PORT || 10000);

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Banco Conectado!"))
    .catch(err => console.error("Erro Mongo:", err));

const Fofoca = mongoose.model('Fofoca', new mongoose.Schema({
  autor: String, 
  conteudo: String, 
  timestamp: { type: Date, default: Date.now }
}));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ID_GRUPO = '120363405181317045@g.us';

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
  }
});

client.on('qr', qr => {
  console.log('--- LEIA O QR CODE ABAIXO ---');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => console.log('🚀 Atreus e Isis prontos!'));

// Captura mensagens
client.on('message', async msg => {
  if (msg.from === ID_GRUPO && !msg.fromMe) {
    try {
        await Fofoca.create({ autor: msg._data.notifyName || 'Membro', conteudo: msg.body });
    } catch (e) { console.log("Erro ao salvar"); }
  }
});

// FUNÇÃO DO PODCAST (A QUE FALTAVA)
async function gerarPodcast() {
    const fofocas = await Fofoca.find().sort({ timestamp: 1 });
    if (fofocas.length < 2) return;

    const contexto = fofocas.map(f => `${f.autor}: ${f.conteudo}`).join('\n');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    try {
        const prompt = `Aja como Atreus (homem ranzinza) e Isis (mulher debochada). Criem um roteiro de podcast zoando estas conversas: ${contexto}`;
        const result = await model.generateContent(prompt);
        const texto = result.response.text();

        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL`, // ID da Isis
            { text: texto, model_id: "eleven_multilingual_v2" },
            { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
        );

        const fileName = './podcast.mp3';
        fs.writeFileSync(fileName, Buffer.from(response.data));
        const media = MessageMedia.fromFilePath(fileName);
        await client.sendMessage(ID_GRUPO, media, { sendAudioAsVoice: true });
        await Fofoca.deleteMany({});
        console.log("✅ Podcast enviado!");
    } catch (err) { console.error("Erro no podcast:", err); }
}

// Comande o bot a cada 1 hora ou por comando
client.on('message', async msg => {
    if (msg.body === '!podcast') await gerarPodcast();
});

client.initialize();
