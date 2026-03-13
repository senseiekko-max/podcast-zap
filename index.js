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

const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('🎙️ Podcast Olimpo Online!');
  res.end();
}).listen(port);

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Olimpo Conectado!"));
const Fofoca = mongoose.model('Fofoca', new mongoose.Schema({ 
    autor: String, conteudo: String, timestamp: { type: Date, default: Date.now } 
}));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ID_GRUPO = '120363405181317045@g.us';

// --- CONFIGURAÇÃO PARA NÃO TRAVAR O RENDER ---
const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 240000, // Aumentei para 4 minutos (o máximo possível)
    qrMaxRetries: 10,
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('\n--- QR CODE GERADO (LEITURA RÁPIDA) ---');
    qrcode.generate(qr, { small: false });
    console.log('---------------------------------------\n');
});

client.on('ready', () => console.log('🎙️ Podcast dos Deuses Online!'));

client.on('auth_failure', () => {
    console.error('❌ Falha na autenticação. Reiniciando...');
    process.exit(1); 
});

client.on('message', async (msg) => {
    if (msg.from === ID_GRUPO) {
        const autor = msg._data.notifyName || 'Membro';
        let texto = msg.body;
        if (msg.hasMedia && (msg.type === 'audio' || msg.type === 'ptt')) {
            try {
                const media = await msg.downloadMedia();
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const result = await model.generateContent(["Resuma o áudio:", { inlineData: { data: media.data, mimeType: media.mimetype } }]);
                texto = `[Áudio]: ${result.response.text()}`;
            } catch (e) { texto = "[Áudio]"; }
        }
        await Fofoca.create({ autor, conteudo: texto });
    }
});

async function gerarPodcast() {
    const fofocas = await Fofoca.find().sort({ timestamp: 1 });
    if (fofocas.length === 0) return;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(`Ricardo e Julia, tom épico, resumam: ${fofocas.map(f => `${f.autor}: ${f.conteudo}`).join('\n')}`);
    const roteiro = result.response.text();
    try {
        const resVoz = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`, 
            { text: roteiro, model_id: "eleven_multilingual_v2" },
            { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
        );
        fs.writeFileSync('voz.mp3', Buffer.from(resVoz.data));
        ffmpeg().input('voz.mp3').input('fundo.mp3').complexFilter(['[1:a]volume=0.15[a1]', '[0:a][a1]amix=inputs=2:duration=first[aout]']).map('[aout]').save('final.mp3').on('end', async () => {
            const media = MessageMedia.fromFilePath('final.mp3');
            await client.sendMessage(ID_GRUPO, media, { sendAudioAsVoice: true });
            await Fofoca.deleteMany({});
        });
    } catch (err) { console.error(err); }
}

cron.schedule('0 20 * * *', () => gerarPodcast());
client.initialize();
