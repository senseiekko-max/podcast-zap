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

// --- SERVER PARA O RENDER ---
http.createServer((req, res) => { res.write('Bot Online!'); res.end(); }).listen(process.env.PORT || 3000);

// --- MONGODB ---
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Banco Conectado!"));
const Fofoca = mongoose.model('Fofoca', new mongoose.Schema({ autor: String, conteudo: String, timestamp: { type: Date, default: Date.now } }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ID_GRUPO = '120363405181317045@g.us';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => { qrcode.generate(qr, { small: true }); });
client.on('ready', () => console.log('🎙️ Podcast Online com Trilha Sonora!'));

client.on('message', async (msg) => {
    if (msg.from === ID_GRUPO) {
        await Fofoca.create({ autor: msg._data.notifyName || 'Membro', conteudo: msg.body });
    }
});

async function gerarPodcast() {
    const fofocas = await Fofoca.find().sort({ timestamp: 1 });
    if (fofocas.length === 0) return;

    const contexto = fofocas.map(f => `${f.autor}: ${f.conteudo}`).join('\n');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(`Você é o Ricardo e a Julia. Façam um podcast engraçado: ${contexto}`);
    const roteiro = result.response.text();

    try {
        // 1. Gera a voz na ElevenLabs
        const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`, 
            { text: roteiro, model_id: "eleven_multilingual_v2" },
            { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
        );
        
        fs.writeFileSync('voz.mp3', Buffer.from(response.data));

        // 2. Mistura a voz com a música de fundo (fundo.mp3)
        // A música de fundo fica com volume baixo (0.1) para não cobrir a voz
        ffmpeg()
            .input('voz.mp3')
            .input('fundo.mp3')
            .complexFilter([
                '[1:a]volume=0.1[a1]', // Baixa o volume do fundo
                '[0:a][a1]amix=inputs=2:duration=first[aout]' // Junta os dois
            ])
            .map('[aout]')
            .save('final.mp3')
            .on('end', async () => {
                const media = MessageMedia.fromFilePath('final.mp3');
                await client.sendMessage(ID_GRUPO, media, { sendAudioAsVoice: true });
                await Fofoca.deleteMany({});
                console.log("✅ Podcast com trilha enviado!");
            });

    } catch (err) { console.error("Erro:", err); }
}

cron.schedule('0 20 * * *', () => gerarPodcast());
client.initialize();
