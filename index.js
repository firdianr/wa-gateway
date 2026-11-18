const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

let sock = null;
let isConnecting = false;
let waConnectionState = 'starting'; // 'starting' | 'connecting' | 'qr' | 'open' | 'close'
let latestQr = null;
let lastDisconnectReason = null;

const AUTH_FOLDER = path.join(__dirname, 'auth_info_baileys');
const QUEUE_FILE = path.join(__dirname, 'queue_storage', 'message_queue.json');

// =========================================================================
// HELPER: PERSISTENT QUEUE (Simpan antrean ke file agar tahan restart/offline)
// =========================================================================
let messageQueue = [];
let isProcessingQueue = false;

// Muat antrean yang tertunda saat server pertama kali menyala
function loadQueueFromFile() {
    try {
        if (fs.existsSync(QUEUE_FILE)) {
            const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
            messageQueue = JSON.parse(raw) || [];
            if (messageQueue.length > 0) {
                console.log(`[Queue] 📥 Memuat ${messageQueue.length} pesan tertunda dari disk.`);
            }
        }
    } catch (err) {
        console.error('[Queue] ❌ Gagal membaca file antrean:', err.message);
        messageQueue = [];
    }
}

function saveQueueToFile() {
    try {
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(messageQueue, null, 2), 'utf8');
    } catch (err) {
        console.error('[Queue] ❌ Gagal menyimpan file antrean:', err.message);
    }
}

function enqueueMessages(phones, message) {
    const rawList = Array.isArray(phones) ? phones.flat(Infinity) : [phones];

    for (let item of rawList) {
        let phone = Array.isArray(item) ? item[0] : item;
        if (!phone) continue;

        let formattedPhone = String(phone).replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }
        if (!formattedPhone) continue;

        messageQueue.push({
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            phone: formattedPhone,
            message: message,
            attempts: 0,
            createdAt: new Date().toISOString()
        });
    }

    saveQueueToFile();
    processQueue(); // Coba proses langsung jika sedang online
}

// Worker pengirim pesan (hanya jalan jika WA berstatus 'open')
async function processQueue() {
    if (isProcessingQueue) return;
    if (messageQueue.length === 0) return;

    // Jika sedang offline / belum login, tunda pengiriman (jangan dihapus dari antrean)
    if (waConnectionState !== 'open' || !sock?.user) {
        console.log(`[Queue] ⏳ Menunda ${messageQueue.length} pesan karena WA sedang offline (${waConnectionState})...`);
        return;
    }

    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        // Cek ulang status koneksi di setiap iterasi (antisipasi internet putus di tengah jalan)
        if (waConnectionState !== 'open' || !sock?.user) {
            console.log(`[Queue] ⚠️ Koneksi terputus saat mengirim. Sisa ${messageQueue.length} pesan ditunda.`);
            break;
        }

        const job = messageQueue[0]; // Ambil item paling depan (FIFO)
        const jid = `${job.phone}@s.whatsapp.net`;

        try {
            // Cek nomor terdaftar di WA
            const [exists] = await sock.onWhatsApp(jid);
            if (!exists?.exists) {
                console.warn(`[Queue] ⚠️ Nomor ${job.phone} tidak terdaftar di WhatsApp, dihapus dari antrean.`);
                messageQueue.shift();
                saveQueueToFile();
                continue;
            }

            await sock.sendMessage(exists.jid, { text: job.message });
            console.log(`[Queue] ✅ Pesan terkirim ke ${exists.jid} (Sisa antrean: ${messageQueue.length - 1})`);

            // Berhasil terkirim -> hapus dari antrean & simpan ke disk
            messageQueue.shift();
            saveQueueToFile();

            // Jeda anti-spam 2 detik antar pesan
            if (messageQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (err) {
            job.attempts += 1;
            console.error(`[Queue] ❌ Gagal kirim ke ${job.phone} (Percobaan ${job.attempts}):`, err.message);

            // Jika gagal karena masalah jaringan/timeout, pertahankan di antrean dan jeda 5 detik
            // Jika sudah gagal permanen lebih dari 5 kali saat status 'open', buang agar tidak menyumbat antrean
            if (job.attempts >= 5 && waConnectionState === 'open') {
                console.error(`[Queue] 🗑️ Pesan ke ${job.phone} dibuang setelah 5x gagal.`);
                messageQueue.shift();
            }

            saveQueueToFile();
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    isProcessingQueue = false;
}

// =========================================================================
// KONEKSI BAILEYS WHATSAPP
// =========================================================================
async function connectToWhatsApp() {
    if (isConnecting) return;
    isConnecting = true;
    waConnectionState = 'connecting';

    if (sock) {
        try {
            sock.ev.removeAllListeners();
            sock.ws?.close();
        } catch (e) {}
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['Sistem Kendaraan Dinas', 'Chrome', '1.0.0']
        });

        const handleCredsUpdate = async () => {
            await saveCreds();
        };
        sock.ev.on('creds.update', handleCredsUpdate);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                waConnectionState = 'qr';
                latestQr = qr;
                console.log('\nScan QR Code di bawah ini menggunakan WhatsApp HP Anda:');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                isConnecting = false;
                waConnectionState = 'close';
                latestQr = null;

                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                lastDisconnectReason = statusCode || 'Unknown';
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;

                console.log(`[WA Gateway] Koneksi terputus (Status: ${lastDisconnectReason}). Mencoba reconnect: ${!isLoggedOut}`);

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
                    // Jika terputus karena internet mati, Baileys akan terus mencoba reconnect tiap 3 detik
                    setTimeout(() => connectToWhatsApp(), 3000);
                }
            } else if (connection === 'open') {
                isConnecting = false;
                waConnectionState = 'open';
                latestQr = null;
                lastDisconnectReason = null;
                console.log('✅ WhatsApp Gateway Berhasil Terhubung!');

                // Begitu internet/WA kembali terhubung, langsung kuras pesan yang tertunda!
                processQueue();
            }
        });
    } catch (err) {
        isConnecting = false;
        waConnectionState = 'close';
        console.error('❌ Gagal inisialisasi Baileys (kemungkinan tidak ada internet):', err.message);
        setTimeout(() => connectToWhatsApp(), 5000);
    }
}

// =========================================================================
// ENDPOINT 1: CEK STATUS KONEKSI & JUMLAH ANTREAN TERTUNDA
// =========================================================================
app.get('/status', (req, res) => {
    const isConnected = waConnectionState === 'open' && Boolean(sock?.user);

    res.json({
        connected: isConnected,
        state: waConnectionState,
        pending_messages: messageQueue.length, // Info tambahan untuk dashboard admin!
        has_qr: Boolean(latestQr),
        disconnect_reason: lastDisconnectReason,
        user: isConnected ? {
            id: sock.user.id.split(':')[0],
            name: sock.user.name || 'Connected Account'
        } : null
    });
});

// =========================================================================
// ENDPOINT 2: TERIMA PESAN (MASUK ANTREAN / PENDING JIKA OFFLINE)
// =========================================================================
app.post('/send-message', (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({
            status: false,
            message: 'Parameter phone dan message wajib diisi'
        });
    }

    // Masukkan ke antrean persisten (tetap diterima walau sedang offline)
    enqueueMessages(phone, message);

    const isOnline = waConnectionState === 'open' && Boolean(sock?.user);

    return res.status(isOnline ? 200 : 202).json({
        status: true,
        queued: !isOnline,
        pending_count: messageQueue.length,
        message: isOnline
            ? 'Pesan masuk antrean dan sedang dikirim.'
            : `WA Gateway sedang offline (${waConnectionState}). Pesan ditunda dan akan otomatis dikirim saat internet/koneksi pulih.`
    });
});

// =========================================================================
// START SERVER
// =========================================================================
loadQueueFromFile();

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`🚀 WA Gateway Server berjalan di http://localhost:${PORT}`);
    connectToWhatsApp();
});

process.on('SIGINT', () => {
    console.log('\n[WA Gateway] Menyimpan antrean & menutup server...');
    saveQueueToFile();
    sock?.ws?.close();
    server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
    console.log('\n[WA Gateway] Menerima SIGTERM, menyimpan antrean & menutup koneksi...');
    saveQueueToFile();
    sock?.ws?.close();
    server.close(() => process.exit(0));
});