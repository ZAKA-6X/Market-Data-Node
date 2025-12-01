# 6X Market Data Node 🚀

![Status](https://img.shields.io/badge/Status-Production_Ready-success?style=flat-square)
![Stack](https://img.shields.io/badge/Stack-MERN-blue?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-gray?style=flat-square)

> **Live Demo:** [https://z6x-market-node.vercel.app](https://z6x-market-node.vercel.app)

A high-performance, real-time financial visualization module architected for digital agencies. This system utilizes a **Secure Node.js Proxy** pattern to handle upstream API rate limits, mask API keys, and deliver sub-150ms latency data to the client.

---

## 🏗 Architecture

The system is designed to decouple the frontend from third-party data providers, ensuring security and stability.

```mermaid
graph LR
    A["Client (React/Vite)"] -->|Secure TLS Request| B["Node.js Proxy (Express)"]
    B -->|Check Cache| C{"Cache Valid?"}
    C -->|Yes| D["Return Cached Data (< 5ms)"]
    C -->|No| E["Fetch Binance API"]
    E -->|Response| B
    B -->|JSON Payload| A
