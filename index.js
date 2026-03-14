require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const mongoose = require('mongoose');
const http = require('http');
const fs = require('fs');

// Server para o Railway manter o serviço ativo
http.createServer((req, res) => { 
    res.writeHead(200);
    res.end('🎙️ Podcast Olimpo: Atreus & Isis'); 
}).listen(process.env.PORT || 10000);

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Banco Conectado!"));

const Fofoca = mongoose.model('Fofoca', new mongoose.Schema({
  autor: String, conteudo: String, timestamp: { type: Date, default: Date.now }
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
  console.log('--- LEIA O QR CODE ---');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => console.log('🚀 Atreus (H) e Isis (M) prontos!'));

client.on('message', async msg => {
  if (msg.from === ID_GRUPO && !msg.fromMe) {
    await Fofoca.create({ autor: msg.pushname || 'Membro', conteudo: msg.body });
  }
  
  if (msg.body === '!podcast') {
    const fofocas = await Fofoca.find().sort({ timestamp: 1 });
    if (fofocas.length < 2) return;

    const contexto = fofocas.map(f => `${f.autor}: ${f.conteudo}`).join('\n');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    try {
        const result = await model.generateContent(`Aja como Atreus e Isis, apresentadores debochados. Roteiro: ${contexto}`);
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL`, 
            { text: result.response.text(), model_id: "eleven_multilingual_v2" },
            { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
        );
        fs.writeFileSync('podcast.mp3', Buffer.from(response.data));
        const media = MessageMedia.fromFilePath('podcast.mp3');
        await client.sendMessage(ID_GRUPO, media, { sendAudioAsVoice: true });
        await Fofoca.deleteMany({});
    } catch (err) { console.error(err); }
  }
});

client.initialize();
