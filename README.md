# 🚀 WhatsApp Gateway Microservice

Layanan **WhatsApp Gateway Microservice** berbasis Node.js (`@whiskeysockets/baileys`) dan ExpressJS yang berjalan mandiri di dalam kontainer Docker. Microservice ini dirancang untuk diintegrasikan secara *decoupled* dengan aplikasi web (seperti Laravel, Node.js, Python, atau PHP Native) melalui REST API HTTP.

---

## 📑 Daftar Isi
- [Fitur Utama](#-fitur-utama)
- [Struktur Direktori](#-struktur-direktori)
- [Prasyarat Sistem](#-prasyarat-sistem)
- [Command Instalasi Lengkap](#-command-instalasi-lengkap)
  - [1. Instalasi Docker & Docker Compose di Server (Ubuntu/Debian)](#1-instalasi-docker--docker-compose-di-server-ubuntudebian)
  - [2. Setup & Deploy WA Gateway Pertama Kali](#2-setup--deploy-wa-gateway-pertama-kali)
- [Dokumentasi API](#-dokumentasi-api)
- [Integrasi Laravel](#-integrasi-laravel)
- [Command Pemeliharaan Lengkap (Maintenance)](#-command-pemeliharaan-lengkap-maintenance)
  - [1. Pemeliharaan & Update Aplikasi](#1-pemeliharaan--update-aplikasi)
  - [2. Backup & Restore Volume Sesi WhatsApp](#2-backup--restore-volume-sesi-whatsapp)
  - [3. Pembersihan Disk & Resource Server](#3-pembersihan-disk--resource-server)
  - [4. Pemeliharaan Log Server](#4-pemeliharaan-log-server)
- [Cheatsheet Operasional Ringkas](#-cheatsheet-operasional-ringkas)
- [Penanganan Masalah (Troubleshooting)](#-penanganan-masalah-troubleshooting)

---

## 🧰 Fitur Utama

- **Standalone Docker Service**: Terisolasi penuh dari aplikasi utama.
- **Persistent Session**: Sesi login WhatsApp tersimpan aman di Docker Volume dan tidak hilang saat kontainer di-*restart*.
- **Auto Clean-up 401 (Logged Out)**: Otomatis menghapus sesi lama yang kadaluarsa/logout dan meregenerasi QR Code baru tanpa memicu *infinite loop*.
- **Async Queue Background Process**: Kirim pesan massal (*array* nomor) secara *non-blocking* dengan jeda waktu (*delay*) yang aman untuk mencegah blokir/banned.
- **Smart Phone Number Formatter**: Otomatis membersihkan karakter non-digit dan mengonversi awalan `08xx` menjadi format internasional `628xx`.

---

## 📁 Struktur Direktori

```text
wa-gateway/
├── Dockerfile
├── docker-compose.yml
├── index.js
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

---

## 🛠️ Prasyarat Sistem

- OS Server: Ubuntu 20.04 / 22.04 LTS, Debian 11/12, atau Windows (via WSL2 + Docker Desktop).
- Minimum RAM: 1 GB (Rekomendasi 2 GB).
- Disk Space Free: 2 GB+.

---

## 📥 Command Instalasi Lengkap

### 1. Instalasi Docker & Docker Compose di Server (Ubuntu/Debian)

Jika Anda baru menyiapkan VPS/Server Linux baru yang belum memiliki Docker, jalankan baris perintah berikut di SSH terminal:

```bash
# Update repository package
sudo apt update && sudo apt upgrade -y

# Install dependensi dasar
sudo apt install -y curl apt-transport-https ca-certificates software-properties-common git

# Tambahkan GPG Key resmi Docker
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Tambahkan repository Docker ke APT source
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Update package list & install Docker Engine + Docker Compose Plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Masukkan user saat ini ke group docker agar bisa run docker tanpa sudo
sudo usermod -aG docker $USER

# Aktifkan service Docker agar otomatis run saat OS booting
sudo systemctl enable docker
sudo systemctl start docker

# Verifikasi versi instalasi
docker --version
docker compose version
```

> **Catatan:** Setelah menjalankan `usermod -aG docker $USER`, lakukan *re-login* SSH (`exit` lalu `ssh` kembali) agar izin grup ter-refresh.

---

### 2. Setup & Deploy WA Gateway Pertama Kali

```bash
# 1. Clone repository dari GitHub
git clone https://github.com/firdianr/wa-gateway.git

# 2. Masuk ke folder proyek
cd wa-gateway

# 3. Build Docker image dan jalankan kontainer di background
docker compose up -d --build

# 4. Tampilkan log kontainer untuk melakukan Scan QR Code
docker logs -f wa-gateway-standalone
```

* Buka aplikasi WhatsApp di HP > **Perangkat Tertaut** > **Tautkan Perangkat**, lalu pindai QR Code yang tampil di layar terminal.
* Setelah status terhubung (`✅ WhatsApp Gateway Berhasil Terhubung!`), tekan `Ctrl + C` untuk keluar dari tampilan log.

---

## 📡 Dokumentasi API

### `POST /send-message`
Kirim pesan teks WhatsApp ke satu nomor atau banyak nomor sekaligus (*array*).

* **URL**: `http://localhost:3000/send-message`
* **Method**: `POST`
* **Headers**: `Content-Type: application/json`

#### Payload (Kirim Tunggal):
```json
{
  "phone": "081234567890",
  "message": "Halo, ini pesan otomatis dari WA Gateway!"
}
```

#### Payload (Kirim Banyak / Array):
```json
{
  "phone": ["081234567890", "089876543210", "6285123456789"],
  "message": "Halo! Ini adalah pengumuman penting."
}
```

#### Respon Berhasil (`200 OK`):
```json
{
  "status": true,
  "message": "Pesan telah diterima dan sedang diproses di antrean background."
}
```

---

## 🔗 Integrasi Laravel

### 1. Konfigurasi `.env` Laravel
```env
WA_GATEWAY_URL=http://localhost:3000
```
*(Jika Laravel dan WA Gateway berada di server Docker terpisah, sesuaikan `localhost` dengan IP Server WA Gateway)*

### 2. Contoh Implementation di Laravel
```php
use Illuminate\Support\Facades\Http;

$response = Http::post(config('services.wa_gateway.url') . '/send-message', [
    'phone' => '081234567890',
    'message' => 'Notifikasi: Permohonan peminjaman kendaraan telah disetujui.',
]);

if ($response->successful()) {
    // Pesan berhasil dikirimkan ke antrean gateway
}
```

---

## 🛠️ Command Pemeliharaan Lengkap (Maintenance)

Berikut adalah panduan perintah untuk pemeliharaan rutin server dan kontainer:

### 1. Pemeliharaan & Update Aplikasi

Gunakan perintah ini saat ada pembaruan kode pada repository GitHub:

```bash
# 1. Masuk ke direktori aplikasi
cd ~/wa-gateway

# 2. Ambil pembaruan kode dari GitHub
git pull origin main

# 3. Rebuild image & restart kontainer tanpa downtime lama
docker compose up -d --build

# 4. Periksa log pasca update untuk memastikan service terhubung kembali
docker logs --tail 50 -f wa-gateway-standalone
```

---

### 2. Backup & Restore Volume Sesi WhatsApp

Untuk mengamankan data sesi login agar bisa dipindahkan ke server lain tanpa scan QR ulang:

#### Backup Sesi ke File Archive (`.tar.gz`):
```bash
# Buat direktori backup jika belum ada
mkdir -p ~/backups

# Export isi volume wa_session_data ke file kompresi tar.gz
docker run --rm \
  -v wa-gateway_wa_session_data:/volume \
  -v ~/backups:/backup \
  alpine tar czvf /backup/wa_session_backup_$(date +%Y%m%m_%H%M%S).tar.gz -C /volume .
```

#### Restore Sesi dari File Archive:
```bash
# 1. Hentikan kontainer gateway
docker compose down

# 2. Restore data dari file backup ke volume Docker
docker run --rm \
  -v wa-gateway_wa_session_data:/volume \
  -v ~/backups:/backup \
  alpine sh -c "rm -rf /volume/* && tar xzvf /backup/NAMA_FILE_BACKUP.tar.gz -C /volume"

# 3. Jalankan kembali kontainer gateway
docker compose up -d
```

---

### 3. Pembersihan Disk & Resource Server

Lakukan pembersihan ini secara berkala (misal: 1 bulan sekali) agar kapasitas disk server tidak penuh oleh *cache* build Docker:

```bash
# Cek penggunaan disk oleh Docker
docker system df

# Hapus build cache yang tidak terpakai
docker builder prune -f

# Hapus Docker Image lama/dangling (yang tidak terasosiasi dengan container running)
docker image prune -f

# Pembersihan menyeluruh (Container stopped, Network unused, Dangling images)
docker system prune -f
```

---

### 4. Pemeliharaan Log Server

Secara default, log Docker dapat membesar seiring waktu. Untuk membatasi ukuran file log di server:

#### Batasi Ukuran Log pada `docker-compose.yml`:
Tambahkan konfigurasi `logging` pada `docker-compose.yml`:
```yaml
services:
  wa-gateway:
    build: .
    container_name: wa-gateway-standalone
    restart: unless-stopped
    ports:
      - "3000:3000"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    volumes:
      - wa_session_data:/app/auth_info_baileys

volumes:
  wa_session_data:
    driver: local
```

#### Truncate Log Secara Manual jika Terlalu Besar:
```bash
# Mengosongkan file log tanpa perlu menghentikan kontainer
sudo truncate -s 0 $(docker inspect --format='{{.LogPath}}' wa-gateway-standalone)
```

---

## 📋 Cheatsheet Operasional Ringkas

| Kategori | Aksi | Perintah Terminal |
| :--- | :--- | :--- |
| **Lifecycle** | Start Service | `docker compose start` |
| | Stop Service | `docker compose stop` |
| | Restart Service | `docker compose restart` |
| | Hard Reset (Hapus Sesi & Scanh ulang) | `docker compose down -v && docker compose up -d` |
| **Monitoring** | Cek Status Kontainer | `docker ps` |
| | Cek Penggunaan CPU & RAM | `docker stats wa-gateway-standalone` |
| | Live Stream Logs | `docker logs -f wa-gateway-standalone` |
| | Cek 100 Baris Log Terakhir | `docker logs --tail 100 wa-gateway-standalone` |
| **Debugging** | Masuk Shell Kontainer | `docker exec -it wa-gateway-standalone sh` |
| | Cek File Sesi dalam Kontainer | `docker exec -it wa-gateway-standalone ls -la /app/auth_info_baileys` |

---

## ❓ Penanganan Masalah (Troubleshooting)

### 1. Status Error `401 Unauthorized / Connection Failure`
* **Penyebab**: Perangkat di-logout dari WhatsApp HP atau sesi kadaluarsa.
* **Solusi**: Sistem otomatis menghapus kredensial lama di volume. Cukup buka `docker logs -f wa-gateway-standalone` dan scan ulang QR Code yang muncul di layar.

### 2. Kontainer Crash / Restart Loop
* **Penyebab**: Memory RAM server habis atau terjadi pembacaan file yang ter-lock.
* **Solusi**:
  1. Periksa log penyebab crash: `docker logs --tail 100 wa-gateway-standalone`
  2. Bebaskan RAM server atau tambahkan *SWAP Memory* jika menggunakan VPS RAM 1GB.

### 3. Port `3000` Bentrok / Already in Use
* **Penyebab**: Ada aplikasi lain di server yang menggunakan port 3000.
* **Solusi**: Ubah pemetaan port di `docker-compose.yml` (misal `"3001:3000"`), lalu rebuild dengan `docker compose up -d --build`.
