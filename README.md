# 🚀 WhatsApp Gateway Microservice

Layanan **WhatsApp Gateway Microservice** berbasis Node.js (`@whiskeysockets/baileys`) dan ExpressJS yang berjalan mandiri di dalam kontainer Docker. Microservice ini dirancang untuk diintegrasikan secara *decoupled* dengan aplikasi web (seperti Laravel, Node.js, Python, atau PHP Native) melalui REST API HTTP.

---

## 📑 Daftar Isi
- [Fitur Utama](#-fitur-utama)
- [Struktur Direktori](#-struktur-direktori)
- [Prasyarat](#-prasyarat)
- [Instalasi & Quick Start](#-instalasi--quick-start)
- [Dokumentasi API](#-dokumentasi-api)
- [Integrasi Laravel](#-integrasi-laravel)
- [Cheatsheet Operasional Lengkap](#-cheatsheet-operasional-lengkap)
- [Penanganan Masalah (Troubleshooting)](#-penanganan-masalah-troubleshooting)

---

## 🧰 Fitur Utama

- **Standalone Docker Service**: Terisolasi penuh dari aplikasi utama.
- **Persistent Session**: Sesi login WhatsApp tidak hilang saat kontainer di-*restart* (menggunakan Docker Volume).
- **Auto Clean-up 401 (Logged Out)**: Otomatis menghapus sesi lama yang tidak valid dan meregenerasi QR Code baru tanpa memicu *infinite loop*.
- **Async Queue Background Process**: Kirim pesan massal (array nomor) secara *non-blocking* dengan jeda waktu (*delay*) aman untuk mencegah *banned*.
- **Smart Phone Number Formatter**: Otomatis membersihkan karakter non-digit dan mengonversi awalan `08xx` menjadi format internasional `628xx`.

---

## 📁 Struktur Direktori

```text
E:\Docker\wa-gateway\
├── Dockerfile
├── docker-compose.yml
├── index.js
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
