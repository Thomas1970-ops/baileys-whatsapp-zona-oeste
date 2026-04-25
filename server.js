const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const path = require('path');
const pino = require('pino');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

let sock = null;
let isConnected = false;
let lastQR = null;

async function startBot() {
    console.log('🚀 Iniciando Baileys...');
    
    try {
        const authPath = path.join('/tmp', 'auth_info_baileys');
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '120.0.0.0'],
            logger: pino({ level: 'silent' })
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📱 QR Code gerado!');
                lastQR = qr;
                const qrImage = await QRCode.toDataURL(qr);
                console.log('✅ QR Code pronto para escanear');
            }
            
            if (connection === 'open') {
                console.log('✅ WhatsApp conectado com sucesso!');
                isConnected = true;
                lastQR = null;
            } else if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('❌ Conexão fechada');
                if (shouldReconnect) {
                    setTimeout(() => startBot(), 3000);
                }
            }
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
        setTimeout(() => startBot(), 5000);
    }
}

app.post('/send-message', async (req, res) => {
    try {
        const { phone, message, nome } = req.body;

        if (!isConnected) {
            return res.status(503).json({ 
                success: false, 
                error: 'WhatsApp não conectado' 
            });
        }

        const numeroFormatado = `55${phone.replace(/\D/g, '')}@s.whatsapp.net`;
        const msg = `Olá ${nome}! 👋\n\nSou assistente da Zona Oeste MCMV.\n\nRaquel vai entrar em contato em breve!\n\n💡 Use seu FGTS para dar entrada!\n\nAtenciosamente,\nEquipe Zona Oeste`;

        await sock.sendMessage(numeroFormatado, { text: msg });

        res.json({ success: true, message: 'Enviado!' });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/status', async (req, res) => {
    let qrImage = null;
    if (lastQR) {
        qrImage = await QRCode.toDataURL(lastQR);
    }
    
    res.json({
        connected: isConnected,
        status: isConnected ? 'Conectado' : 'Desconectado',
        qr: qrImage,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Baileys WhatsApp</title>
            <style>
                body { font-family: Arial; text-align: center; padding: 50px; }
                #qr { max-width: 300px; margin: 20px auto; }
                .status { font-size: 20px; margin: 20px 0; }
                .connected { color: green; }
                .disconnected { color: red; }
            </style>
        </head>
        <body>
            <h1>🤖 Baileys WhatsApp</h1>
            <div class="status" id="status">Carregando...</div>
            <div id="qr"></div>
            <script>
                async function updateStatus() {
                    const res = await fetch('/status');
                    const data = await res.json();
                    
                    const status = document.getElementById('status');
                    const qr = document.getElementById('qr');
                    
                    if (data.connected) {
                        status.innerHTML = '<span class="connected">✅ Conectado!</span>';
                        qr.innerHTML = '';
                    } else {
                        status.innerHTML = '<span class="disconnected">❌ Desconectado</span>';
                        if (data.qr) {
                            qr.innerHTML = '<img src="' + data.qr + '" alt="QR Code">';
                        } else {
                            qr.innerHTML = '<p>Aguardando QR Code...</p>';
                        }
                    }
                }
                
                updateStatus();
                setInterval(updateStatus, 3000);
            </script>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
startBot();
app.listen(PORT, () => console.log(`🌐 Servidor na porta ${PORT}`));
