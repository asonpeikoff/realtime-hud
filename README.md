# Realtime HUD

A Heads-Up Display powered by the OpenAI Realtime API (`gpt-realtime-1.5`).

Analyzes your screen captures and audio streams in real-time, surfacing useful supplementary information, insights, and confirmations directly in your HUD.

## Features

- 🖥 **Screen capture** – select any monitor or window to analyze (single or multi-monitor)
- 🎙 **Microphone audio** – include your voice for full context
- 🔊 **System/computer audio** – capture what's playing on your screen
- 💡 **AI HUD display** – real-time insights streamed as they are generated
- ⌨ **Steerable** – collapsible text input to direct the AI when needed
- 🔒 **Privacy first** – clear recording indicator, instant stop, no data storage
- ⤢ **Pop-out display** – open the HUD in a second window for multi-monitor setups
- 🔄 **Provider-agnostic** – OpenAI now; designed for future offline/private models

## Privacy

- Your API key never leaves your machine (kept in server `.env`, never sent to the browser)
- Screen and audio data are proxied **directly** to OpenAI – nothing is stored on the server
- A prominent **Recording** badge indicates when the session is active
- You can stop the session at any time

## Quick Start

### 1. Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- An [OpenAI API key](https://platform.openai.com/api-keys) with Realtime API access

### 2. Install

```bash
git clone https://github.com/hack-r/realtime-hud.git
cd realtime-hud
npm install
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

### 4. Run (development)

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Build for production

```bash
npm run build
npm start
```

## Usage

1. Click **Select Screen to Capture** and choose a monitor or window
2. Optionally enable **Microphone** and/or **System Audio**
3. Click **Start AI Session**
4. AI insights appear in the right panel as your screen is analyzed
5. Use **⤢ Pop Out** to move the HUD display to a second monitor
6. Click **▼ Steer AI** to open the text input for directing the AI
7. Click **Stop Session** to end recording

## Architecture

```
Browser (React + Vite)
  └─ WebSocket ──▶ Node.js / Express proxy
                       └─ WebSocket ──▶ OpenAI Realtime API
                                           (gpt-realtime-1.5)
```

The API key is stored server-side only. The browser connects to a local WebSocket proxy that forwards traffic to OpenAI.

## Provider Roadmap

The `AIProvider` interface (`src/types/index.ts`) is designed for swappability:

| Status | Provider |
|--------|----------|
| ✅ | OpenAI Realtime (`gpt-realtime-1.5`) |
| 🗓 | Other cloud providers (Gemini Live, etc.) |
| 🗓 | Fully offline/private local model |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | required | Your OpenAI API key |
| `PORT` | `3001` | Server port |
| `OPENAI_MODEL` | `gpt-realtime-1.5` | Realtime model to use |
Heads Up Display with RT AI. Will start with OpenAI, but provider agnostic.
