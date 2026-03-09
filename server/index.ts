import { createServer } from 'http';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-realtime-preview';
const HUD_SYSTEM_PROMPT = process.env.HUD_SYSTEM_PROMPT ?? '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (!OPENAI_API_KEY) {
  console.error('[server] ERROR: OPENAI_API_KEY is not set. Please create a .env file.');
  process.exit(1);
}

const app = express();
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,            // 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: OPENAI_MODEL });
});

// Config endpoint (non-sensitive)
app.get('/api/config', (_req, res) => {
  res.json({
    model: OPENAI_MODEL,
    ...(HUD_SYSTEM_PROMPT ? { systemPrompt: HUD_SYSTEM_PROMPT } : {}),
  });
});

// In production, serve the built client files (after API routes so wildcards don't catch /api/*)
if (IS_PRODUCTION) {
  const staticLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const clientDist = path.join(__dirname, '..', 'client');
  app.use(staticLimiter);
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Create HTTP server
const server = createServer(app);

// WebSocket server for Realtime API proxy
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (clientWs) => {
  console.log('[server] Client connected to Realtime proxy');

  const openaiWs = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${OPENAI_MODEL}`,
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    }
  );

  let openaiReady = false;
  const pendingMessages: Buffer[] = [];

  openaiWs.on('open', () => {
    openaiReady = true;
    console.log('[server] Connected to OpenAI Realtime API');
    // Send any queued messages
    for (const msg of pendingMessages) {
      openaiWs.send(msg);
    }
    pendingMessages.length = 0;
  });

  // Forward client -> OpenAI
  clientWs.on('message', (data: Buffer) => {
    if (openaiReady) {
      openaiWs.send(data);
    } else {
      pendingMessages.push(data);
    }
  });

  // Forward OpenAI -> client
  openaiWs.on('message', (data: Buffer) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });

  openaiWs.on('error', (err) => {
    console.error('[server] OpenAI WebSocket error:', err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          error: { message: `OpenAI connection error: ${err.message}` },
        })
      );
      clientWs.close();
    }
  });

  openaiWs.on('close', (code, reason) => {
    console.log(`[server] OpenAI WebSocket closed: ${code} ${reason.toString()}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  });

  clientWs.on('close', () => {
    console.log('[server] Client disconnected');
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });

  clientWs.on('error', (err) => {
    console.error('[server] Client WebSocket error:', err.message);
  });
});

// Upgrade HTTP -> WebSocket for /api/realtime
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/api/realtime') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`[server] Realtime HUD server listening on http://localhost:${PORT}`);
  console.log(`[server] Model: ${OPENAI_MODEL}`);
  console.log(`[server] WebSocket proxy: ws://localhost:${PORT}/api/realtime`);
});
