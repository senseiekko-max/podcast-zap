require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const cron = require('node-cron');
const mongoose = require('mongoose');

// Conexão com o Banco
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Banco de Dados Conectado!"));

const FofocaSchema = new mongoose.Schema({
    autor: String,
    conteudo: String,
    timestamp: { type: Date, default: Date.now }
});
const Fofoca = mongoose.model('Fofoca', FofocaSchema);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ID_GRUPO = '120363405181317045@g.us';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('🎙️ Podcast Online!'));

client.on('message', async (msg) => {
    if (msg.from === ID_GRUPO) {
        const autor = msg._data.notifyName || 'Membro';
        let texto = msg.body;

        if (msg.hasMedia && (msg.type === 'audio' || msg.type === 'ptt')) {
            try {
                const media = await msg.downloadMedia();
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const result = await model.generateContent([
                    "Transcreva brevemente este áudio:", { inlineData: { data: media.data, mimeType: media.mimetype } }
                ]);
                texto = `[Áudio]: ${result.response.text()}`;
            } catch (e) { texto = "[Áudio]"; }
        }
        
        await Fofoca.create({ autor, conteudo: texto });
    }
});

async function gerarPodcast() {
    const fofocas = await Fofoca.find().sort({ timestamp: 1 });
    if (fofocas.length === 0) return;

    const contexto = fofocas.map(f => `${f.autor}: ${f.conteudo}`).join('\n');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Você é o Ricardo (irônico) e a Julia (engraçada). 
    Comecem o podcast obrigatoriamente dizendo: "Boa noite deuses do Olimpo!".
    Zoem as fofocas do dia citando os nomes dos membros.
    Conversas: ${contexto}`;

    const result = await model.generateContent(prompt);
    const roteiro = result.response.text();

    try {
        const res = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`, 
            { text: roteiro, model_id: "eleven_multilingual_v2" },
            { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
        );
        
        const media = new MessageMedia('audio/mp3', Buffer.from(res.data).toString('base64'), 'podcast.mp3');
        await client.sendMessage(ID_GRUPO, media, { sendAudioAsVoice: true });
        
        await Fofoca.deleteMany({}); // Limpa para o próximo dia
    } catch (err) { console.error("Erro ElevenLabs:", err); }
}

cron.schedule('0 20 * * *', () => {
    console.log("🚀 Gerando Podcast das 20h...");
    gerarPodcast();
});

client.initialize();