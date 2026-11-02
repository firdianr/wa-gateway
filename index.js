const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

let sock;
let isConnecting = false;
const AUTH_FOLDER = path.join(__dirname, 'auth_info_baileys');

async function connectToWhatsApp() {
    if (isConnecting) return;
    isConnecting = true;

    if (sock) {
        try {
            sock.ev.removeAllListeners();
            sock.ws?.close();
        } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state
    });

    const handleCredsUpdate = async () => {
        await saveCreds();
    };
    sock.ev.on('creds.update', handleCredsUpdate);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\nScan QR Code di bawah ini menggunakan WhatsApp HP Anda:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            isConnecting = false;
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;

            console.log(`[WA Gateway] Koneksi terputus (Status: ${statusCode || 'Unknown'}). Reconnect: ${!isLoggedOut}`);

            sock.ev.off('creds.update', handleCredsUpdate);
            sock.ev.removeAllListeners();

            if (isLoggedOut) {
                console.log('⚠️ Sesi tidak valid / Logged Out (401). Menghapus folder auth_info_baileys...');

                await new Promise(resolve => setTimeout(resolve, 1000));

                if (fs.existsSync(AUTH_FOLDER)) {
                    try {
                        fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                        console.log('✅ Folder auth_info_baileys berhasil dihapus.');
                    } catch (err) {
                        console.error('❌ Gagal menghapus folder auth:', err.message);
                    }
                }

                console.log('🔄 Memulai ulang gateway untuk generate QR Code baru...');
                setTimeout(() => connectToWhatsApp(), 1500);
            } else {
                setTimeout(() => connectToWhatsApp(), 3000);
            }
        } else if (connection === 'open') {
            isConnecting = false;
            console.log('✅ WhatsApp Gateway Berhasil Terhubung!');
        }
    });
}

// Endpoint pengiriman pesan
app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ status: false, message: 'Parameter phone dan message wajib diisi' });
    }

    res.json({ status: true, message: 'Pesan telah diterima dan sedang diproses di antrean background.' });

    const rawList = Array.isArray(phone) ? phone.flat(Infinity) : [phone];

    (async () => {
        for (let i = 0; i < rawList.length; i++) {
            let item = rawList[i];

            if (Array.isArray(item)) {
                item = item[0];
            }

            if (!item) continue;

            try {
                let formattedPhone = String(item).replace(/[^0-9]/g, '');

                if (formattedPhone.startsWith('0')) {
                    formattedPhone = '62' + formattedPhone.slice(1);
                }

                if (!formattedPhone) continue;

                const jid = `${formattedPhone}@s.whatsapp.net`;

                await sock.sendMessage(jid, { text: message });
                console.log(`[WA Gateway] ✅ Pesan terkirim ke ${jid} (${i + 1}/${rawList.length})`);

            } catch (err) {
                console.error(`[WA Gateway] ❌ Gagal kirim pesan ke ${item}:`, err.message);
            }

            if (i < rawList.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    })();
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 WA Gateway Server berjalan di http://localhost:${PORT}`);
    connectToWhatsApp();
});