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

// Mantém o Render acordado
http.createServer((req, res) => { res.write('Bot Online!'); res.end(); }).listen(process.env.PORT || 3000);

// Conexão MongoDB
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Conectado ao Olimpo!"));
const Fofoca = mongoose.model('Fofoca', new mongoose.Schema({ autor: String, conteudo: String, timestamp: { type: Date, default: Date.now } }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ID_GRUPO = '120363405181317045@g.us';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => { qrcode.generate(qr, { small: true }); });
client.on('ready', () => console.log('🎙️ Podcast Épico Online!'));

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
    
    // Ajuste do tom para ser épico e combinar com a música
    const prompt = `Você é o Ricardo e a Julia, deuses do entretenimento. 
    O tom deve ser grandioso, top e épico, como se estivessem no topo do Monte Olimpo.
    Usem gírias atuais mas com uma postura superior. 
    Narrem as fofocas do dia de forma lendária: ${contexto}`;

    const result = await model.generateContent(prompt);
    const roteiro = result.response.text();

    try {
        const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`, 
            { text: roteiro, model_id: "eleven_multilingual_v2" },
            { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
        );
        
        fs.writeFileSync('voz.mp3', Buffer.from(response.data));

        // Mistura com o fundo.mp3 que você subiu
        ffmpeg()
            .input('voz.mp3')
            .input('fundo.mp3')
            .complexFilter([
                '[1:a]volume=0.15[a1]', // Música de fundo no volume ideal
                '[0:a][a1]amix=inputs=2:duration=first[aout]'
            ])
            .map('[aout]')
            .save('final.mp3')
            .on('end', async () => {
                const media = MessageMedia.fromFilePath('final.mp3');
                await client.sendMessage(ID_GRUPO, media, { sendAudioAsVoice: true });
                await Fofoca.deleteMany({});
                console.log("✅ Podcast Divino enviado!");
            });

    } catch (err) { console.error("Erro no processo:", err); }
}

cron.schedule('0 20 * * *', () => gerarPodcast());
client.initialize();
