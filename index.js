require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const cron = require('node-cron');
const mongoose = require('mongoose');
const http = require('http');
const fs = require('fs');

const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Olimpo Online!');
}).listen(port);

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB Conectado"));
const Fofoca = mongoose.model('Fofoca', new mongoose.Schema({ autor: String, conteudo: String }));

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    }
});

client.on('qr', (qr) => {
    console.log('\n--- ESCANEIE AGORA ---');
    qrcode.generate(qr, { small: false });
});

client.on('ready', () => console.log('🎙️ Podcast Online!'));

client.on('message', async (msg) => {
    if (msg.from === '120363405181317045@g.us') {
        await Fofoca.create({ autor: msg._data.notifyName || 'Membro', conteudo: msg.body });
    }
});

client.initialize();
