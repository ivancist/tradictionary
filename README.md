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

- 📖 **EPUB Reader** — Read books with dark-mode styled Epub.js, plus PDF support
- 🎯 **Reading Mode** — Text you've read stays bright, unread text is faded; the boundary follows your cursor word by word (CSS Custom Highlight API)
- 📌 **Reading Checkpoint** — Click to save your spot (pauses Reading Mode), click again to resume; the checkpoint survives reloads
- 🔄 **Exact Position Restore** — Books reopen on the precise page you left, via saved screen-start CFIs with automatic re-anchoring after layout settles
- ⚡ **Fast Book Opening** — Per-book location caching: the whole-book parse happens once, later opens are near-instant
- 🔍 **Unified Search** — One input for translation + definition + images + audio  
- 📝 **Translation** — Powered by Llama 3.2 via Ollama, with context-aware examples
- 📖 **Definitions** — Free Dictionary API and Wiktionary with Ollama fallback
- 🌐 **WordReference** — Scraped translations with categories, contexts, and example sentences
- 🖼️ **Images** — DuckDuckGo image search and Wiktionary media (no API key needed)
- 🔊 **Pronunciation** — Microsoft Edge TTS (40+ languages)
- 🖍️ **Highlighter** — Persistent text highlights with an eraser tool
- 📚 **Library** — Upload, manage, and switch between EPUBs/PDFs (URL import supported)
- ⚙️ **Language Settings** — 16 languages supported, with quick language swapping
- ⌨️ **Keyboard Navigation** — Arrow keys to turn pages, also from inside the reader

### Reading Mode in detail

| Action | Effect |
|--------|--------|
| Move the cursor while active | Read/unread boundary follows the word under the cursor |
| Single click | Saves the checkpoint and pauses (position persists across reloads) |
| Single click while paused | Resumes Reading Mode from the cursor |
| Select text (double-click or drag) | Looks up the selection; read text dims, selection is highlighted |
| Click with text selected | First click deselects, the next click resumes |

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
| `POST` | `/api/wordreference` | WordReference translations with examples |
| `GET` | `/api/images?q=word` | DuckDuckGo image search |
| `GET` | `/api/tts?text=word&lang=en` | Text-to-speech audio |
| `POST` | `/api/epub/upload` | Upload EPUB |
| `GET` | `/api/epub/library` | List library |
| `GET` | `/api/epub/{id}` | Serve EPUB file |

## License

MIT
