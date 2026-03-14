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
  res.end('🎙️ Olimpo Online Ativo com Atreus e Isis!');
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

// --- CONFIGURAÇÃO PUPPETEER PARA DOCKER ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: '/usr/bin/google-chrome-stable',
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
    console.log('\n\n--- ESCANEIE O QR CODE ABAIXO ---');
    qrcode.generate(qr, { small: false });
    console.log('\n---------------------------------\n');
});

client.on('ready', () => {
    console.log('🚀 ATREUS E ISIS ONLINE NO OLIMPO!');
});

client.on('message', async (msg) => {
    if (msg.from === ID_GRUPO) {
        const autor = msg._data.notifyName || 'Membro';
        let texto = msg.body;
        if (msg.hasMedia && (msg.type === 'audio' || msg.type === 'ptt')) {
            try {
                const media = await msg.downloadMedia();
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const result = await model.generateContent([
                    "Resuma este áudio de forma engraçada:", 
                    { inlineData: { data: media.data, mimeType: media.mimetype } }
                ]);
                texto = `[Áudio]: ${result.response.text()}`;
            } catch (e) { texto = "[Áudio enviado]"; }
        }
        await Fofoca.create({ autor, conteudo: texto });
    }
});

async function gerarPodcast() {
    console.log("🎬 Gravando o episódio de hoje...");
    const fofocas = await Fofoca.find().sort({ timestamp: 1 });
    if (fofocas.length === 0) return;
    
    const contexto = fofocas.map(f => `${f.autor}: ${f.conteudo}`).join('\n');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    try {
        const result = await model.generateContent(`Você é Atreus (homem debochado) e Isis (mulher irônica). Criem um roteiro de podcast curto comentando estas fofocas do grupo Olimpo de forma hilária: ${contexto}`);
        const roteiro = result.response.text();

        // Voz da Isis (Exemplo de ID feminino da ElevenLabs)
        const resVoz = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL`, 
            { text: roteiro, model_id: "eleven_multilingual_v2" },
            { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
        );
        
        fs.writeFileSync('voz.mp3', Buffer.from(resVoz.data));
        
        ffmpeg().input('voz.mp3').input('fundo.mp3')
            .complexFilter(['[1:a]volume=0.15[a1]', '[0:a][a1]amix=inputs=2:duration=first[aout]'])
            .map('[aout]').save('final.mp3')
            .on('end', async () => {
                const media = MessageMedia.fromFilePath('final.mp3');
                await client.sendMessage(ID_GRUPO, media, { sendAudioAsVoice: true });
                await Fofoca.deleteMany({});
                console.log("✅ Podcast enviado!");
            });
    } catch (err) {
        console.error("Erro na geração:", err);
    }
}

cron.schedule('0 23 * * *', () => gerarPodcast());

client.initialize();
