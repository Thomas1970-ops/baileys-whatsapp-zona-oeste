const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const pino = require('pino');

const app = express();
app.use(bodyParser.json());

let sock = null;
let isConnected = false;

// ============================================
// INICIAR BOT
// ============================================

async function startBot() {
    console.log('🚀 Iniciando Baileys...');
    
    try {
        const authPath = path.join('/tmp', 'auth_info_baileys');
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            browser: ['Ubuntu', 'Chrome', '120.0.0.0'],
            logger: pino({ level: 'silent' })
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📱 QR Code gerado! Escaneie com WhatsApp');
            }
            
            if (connection === 'open') {
                console.log('✅ WhatsApp conectado com sucesso!');
                isConnected = true;
            } else if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('❌ Conexão fechada. Reconectando...', shouldReconnect);
                if (shouldReconnect) {
                    setTimeout(() => startBot(), 3000);
                }
            }
        });

    } catch (error) {
        console.error('❌ Erro ao iniciar Baileys:', error);
        setTimeout(() => startBot(), 5000);
    }
}

// ============================================
// ENDPOINTS DA API
// ============================================

app.post('/send-message', async (req, res) => {
    try {
        const { phone, message, nome } = req.body;

        if (!phone || !message) {
            return res.status(400).json({ 
                success: false, 
                error: 'Phone e message são obrigatórios' 
            });
        }

        if (!isConnected) {
            return res.status(503).json({ 
                success: false, 
                error: 'WhatsApp não está conectado. Tente novamente em 30 segundos.' 
            });
        }

        const numeroLimpo = phone.replace(/\D/g, '');
        const numeroFormatado = `55${numeroLimpo}@s.whatsapp.net`;

        const mensagemBemVindo = `Olá ${nome}! 👋\n\nSou um assistente automático da Zona Oeste MCMV.\n\nVi que você se interessou por nossos imóveis com entrada facilitada!\n\nEm breve, a Raquel (nossa consultora) vai entrar em contato para tirar suas dúvidas.\n\n💡 Dica: Você pode usar seu FGTS para dar entrada!\n\nAtenciosamente,\nEquipe Zona Oeste MCMV`;

        await sock.sendMessage(numeroFormatado, { text: mensagemBemVindo });

        console.log(`✅ Mensagem enviada para ${phone}`);

        res.json({ 
            success: true, 
            message: 'Mensagem enviada com sucesso!',
            phone: phone,
            nome: nome
        });

    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        status: isConnected ? 'Conectado' : 'Desconectado',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

startBot().then(() => {
    app.listen(PORT, () => {
        console.log(`🌐 Servidor rodando na porta ${PORT}`);
        console.log(`📱 Escaneie o QR Code acima com seu WhatsApp`);
        console.log(`🔗 URL: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost:' + PORT}`);
    });
}).catch(err => {
    console.error('❌ Erro ao iniciar bot:', err);
    process.exit(1);
});
