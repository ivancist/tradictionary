# Tradictionary

A containerized language learning platform that unifies EPUB reading, translation, dictionary definitions, pronunciation, and image search into a single, plug-and-play interface.

> **Stop switching between WordReference, Cambridge, and Google Images.** Open your EPUB, select a word, and get everything in one sidebar.

## Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/) v2+
- **NVIDIA users**: [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)

### Run (CPU / Apple Silicon)
```bash
docker compose up --build
```

### Run (NVIDIA GPU)
```bash
docker compose -f docker-compose.yml -f docker-compose.cuda.yml up --build
```

### First launch
1. Open **http://localhost:5173** in your browser
2. The first start pulls the `llama3.2-vision` model (~2 GB) — this only happens once
3. Upload an EPUB → select text → get instant results

## Architecture

| Service | Port | Role |
|---------|------|------|
| **frontend** | 5173 | React + Epub.js reader UI |
| **backend** | 8000 | FastAPI — translation, TTS, image search, EPUB management |
| **ollama** | 11434 | LLM inference (internal only) |

```
User → Frontend (React) → Backend (FastAPI) → Ollama / DuckDuckGo / edge-tts
```

## Features

- 📖 **EPUB Reader** — Read books with dark-mode styled Epub.js
- 🔍 **Unified Search** — One input for translation + definition + images + audio  
- 📝 **Translation** — Powered by Llama 3.2 via Ollama
- 📖 **Definitions** — Free Dictionary API with Ollama fallback
- 🖼️ **Images** — DuckDuckGo image search (no API key needed)
- 🔊 **Pronunciation** — Microsoft Edge TTS (40+ languages)
- 📚 **Library** — Upload, manage, and switch between EPUBs
- ⚙️ **Language Settings** — 16 languages supported

## Project Structure

```
tradictionary/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py              # FastAPI + unified search
│       ├── config.py
│       ├── routers/             # translate, define, images, tts, epub
│       ├── services/            # ollama_client, dictionary, image_search, tts_engine, epub_manager
│       └── models/schemas.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── App.tsx              # Main layout
│       ├── components/          # EpubReader, SearchSidebar, cards
│       ├── hooks/               # useSearch, useEpub
│       └── services/api.ts
└── scripts/
    └── init-model.sh
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/search` | Unified search (translate + define + images + TTS) |
| `POST` | `/api/translate` | Translation via Ollama |
| `POST` | `/api/define` | Dictionary lookup |
| `GET` | `/api/images?q=word` | DuckDuckGo image search |
| `GET` | `/api/tts?text=word&lang=en` | Text-to-speech audio |
| `POST` | `/api/epub/upload` | Upload EPUB |
| `GET` | `/api/epub/library` | List library |
| `GET` | `/api/epub/{id}` | Serve EPUB file |

## License

MIT
