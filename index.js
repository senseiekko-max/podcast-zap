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

// --- CONEXÃO MONGODB ---
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Olimpo Conectado!"));
const Fofoca = mongoose.model('Fofoca', new mongoose.Schema({ autor: String, conteudo: String, timestamp: { type: Date, default: Date.now } }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ID_GRUPO = '120363405181317045@g.us';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

client.on('qr', (qr) => { qrcode.generate(qr, { small: true }); });
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
                const result = await model.generateContent(["Transcreva este áudio de fofoca brevemente:", { inlineData: { data: media.data, mimeType: media.mimetype } }]);
                texto = `[Áudio transcrito]: ${result.response.text()}`;
            } catch (e) { texto = "[Áudio]"; }
        }
        await Fofoca.create({ autor, conteudo: texto });
    }
});

// --- O SHOW DOS DEUSES ---
async function gerarPodcast() {
    const fofocas = await Fofoca.find().sort({ timestamp: 1 });
    if (fofocas.length === 0) return;

    const contexto = fofocas.map(f => `${f.autor}: ${f.conteudo}`).join('\n');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Você é o Ricardo (irônico e sarcástico) e a Julia (engraçada e debochada).
    O tom deve ser ÉPICO e "TOP", combinando com música instrumental divina.
    
    1. Comece SEMPRE com: "Boa noite deuses do Olimpo! Como foi o dia de guerra hoje?" ou variações divinas bem grandiosas.
    2. Façam um resumo de todas as fofocas e áudios que aconteceram no grupo hoje.
    3. Interajam um com o outro, tirando onda com o que os membros falaram.
    4. Usem gírias, mas mantenham a postura de deuses.
    
    Conversas do dia:
    ${contexto}`;

    const result = await model.generateContent(prompt);
    const roteiro = result.response.text();

    try {
        const resVoz = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`, 
            { text: roteiro, model_id: "eleven_multilingual_v2" },
            { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
        );
        fs.writeFileSync('voz.mp3', Buffer.from(resVoz.data));

        ffmpeg()
            .input('voz.mp3')
            .input('fundo.mp3')
            .complexFilter(['[1:a]volume=0.15[a1]', '[0:a][a1]amix=inputs=2:duration=first[aout]'])
            .map('[aout]')
            .save('final.mp3')
            .on('end', async () => {
                const media = MessageMedia.fromFilePath('final.mp3');
                await client.sendMessage(ID_GRUPO, media, { sendAudioAsVoice: true });
                await Fofoca.deleteMany({}); // Limpa o dia
            });
    } catch (err) { console.error(err); }
}

cron.schedule('0 20 * * *', () => gerarPodcast());
client.initialize();
