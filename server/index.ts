import { createServer } from 'http';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.cwd();
const PROMPTS_DIR = path.join(PROJECT_ROOT, 'prompts');
const REALTIME_PROMPT_PATH = path.join(PROMPTS_DIR, 'realtime-system.txt');
const HUD_NOTE_PROMPT_PATH = path.join(PROMPTS_DIR, 'hud-note-system.txt');
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-realtime-1.5';
const OPENAI_REALTIME_INTERFACE = (process.env.OPENAI_REALTIME_INTERFACE ?? 'beta').toLowerCase();
const HUD_SYSTEM_PROMPT = process.env.HUD_SYSTEM_PROMPT ?? '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ALLOWED_REALTIME_MODELS = new Set(['gpt-realtime-1.5']);
const ALLOWED_RESPONSES_MODELS = new Set(['gpt-5.2', 'gpt-5.4']);
const DEFAULT_REALTIME_PROMPT = `You are a realtime HUD assistant.

Ground every update in the currently visible screen and audio context.
Do not merely describe what is visible. Add supplemental information that helps the user work.

Preferred behavior:
- Surface implications, risks, missing context, likely causes, and next actions.
- Write compact, well-formatted notes rather than chatty prose.
- Prefer stable updates over noisy rewrites.
- When tools are available, use them to enrich the answer instead of guessing.
- If the visible content suggests web research would help, explicitly say what should be checked.`;
const DEFAULT_HUD_NOTE_PROMPT = `You are maintaining a persistent heads-up display canvas for a user actively working on their computer.

Your job is to produce supplemental notes, not descriptions.

Core requirements:
- Ground every update in the currently visible screen or user prompt.
- Do not narrate the screenshot or restate obvious UI text unless it matters.
- Add value: infer intent, identify risks, summarize key facts, point out contradictions, suggest concrete next steps.
- Prefer concise, well-formatted notes over prose.
- When tools such as web search, file search, or code search are available, use them to gather missing context instead of guessing.
- If a tool is not available, say what additional lookup would be useful, but still provide the best grounded notes you can.
- Preserve useful existing notes, remove stale material, and avoid churn.

Return ONLY valid JSON with this exact shape:
{"changed": boolean, "board": string}

The board must be compact markdown. Use these sections when relevant:
# Focus
## What changed
## Key details
## External context
## Watch / risks
## Next useful actions

Formatting rules:
- Prefer short bullets.
- Keep the board dense and skimmable.
- Include external facts only when they are relevant to the current task.
- If nothing materially changed, return {"changed": false, "board": previous board string}.`;

function readPromptFile(filePath: string): string | null {
  try {
    const text = fs.readFileSync(filePath, 'utf8').trim();
    return text || null;
  } catch {
    return null;
  }
}

function getRealtimeSystemPrompt(): string {
  const filePrompt = readPromptFile(REALTIME_PROMPT_PATH);
  if (filePrompt) return filePrompt;
  if (HUD_SYSTEM_PROMPT.trim()) return HUD_SYSTEM_PROMPT.trim();
  return DEFAULT_REALTIME_PROMPT;
}

function getHudNoteSystemPrompt(): string {
  const filePrompt = readPromptFile(HUD_NOTE_PROMPT_PATH);
  if (filePrompt) return filePrompt;
  if (HUD_SYSTEM_PROMPT.trim()) return HUD_SYSTEM_PROMPT.trim();
  return DEFAULT_HUD_NOTE_PROMPT;
}

function pickRealtimeModel(rawModel?: string): string {
  if (rawModel && ALLOWED_REALTIME_MODELS.has(rawModel)) {
    return rawModel;
  }
  return OPENAI_MODEL;
}

function pickRealtimeInterface(rawInterface?: string): 'ga' | 'beta' {
  const normalized = (rawInterface ?? OPENAI_REALTIME_INTERFACE).toLowerCase();
  return normalized === 'ga' ? 'ga' : 'beta';
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

if (!OPENAI_API_KEY) {
  console.error('[server] ERROR: OPENAI_API_KEY is not set. Please create a .env file.');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: ['application/sdp', 'text/plain'], limit: '2mb' }));

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
    realtimeInterface: pickRealtimeInterface(),
    systemPrompt: getRealtimeSystemPrompt(),
  });
});

app.get('/api/session', async (req, res) => {
  try {
    const realtimeModel = pickRealtimeModel(typeof req.query.model === 'string' ? req.query.model : undefined);
    const realtimeInterface = pickRealtimeInterface(
      typeof req.query.realtime_interface === 'string' ? req.query.realtime_interface : undefined,
    );

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        ...(realtimeInterface === 'beta' ? { 'OpenAI-Beta': 'realtime=v1' } : {}),
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: realtimeModel,
          instructions: getRealtimeSystemPrompt(),
        },
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error('[server] Realtime client secret failed:', response.status, responseText);
      return res.status(response.status).type('application/json').send(responseText);
    }

    res.type('application/json').send(responseText);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create realtime client secret.';
    console.error('[server] Realtime client secret error:', message);
    res.status(500).json({ error: message });
  }
});

app.post('/api/hud-note', async (req, res) => {
  try {
    const body = req.body as { model?: string; prompt?: string; imageBase64?: string; previousCanvas?: string };
    const model = body?.model ?? '';
    const prompt = body?.prompt?.trim() ?? '';
    const imageBase64 = body?.imageBase64;
    const previousCanvas = body?.previousCanvas?.trim() ?? '';

    if (!ALLOWED_RESPONSES_MODELS.has(model)) {
      return res.status(400).json({ error: `Unsupported non-realtime model: ${model}` });
    }

    if (!prompt && !imageBase64) {
      return res.status(400).json({ error: 'Either prompt or imageBase64 is required.' });
    }

    const userContent: Array<Record<string, string>> = [];
    if (prompt) {
      userContent.push({ type: 'input_text', text: prompt });
    }
    if (imageBase64) {
      userContent.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${imageBase64}` });
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [{
              type: 'input_text',
              text: getHudNoteSystemPrompt(),
            }],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text:
                  `User steering prompt: ${prompt || '(none)'}` +
                  `\n\nPrevious HUD canvas:\n${previousCanvas || '(empty)'}` +
                  '\n\nIf the new input does not materially change the HUD, return {"changed": false, "board": previous board string}.',
              },
              ...userContent,
            ],
          },
        ],
      }),
    });

    const payload = (await response.json()) as {
      output_text?: string;
      error?: { message?: string };
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };

    if (!response.ok) {
      const errMsg = payload?.error?.message ?? `Responses API failed (${response.status})`;
      return res.status(502).json({ error: errMsg });
    }

    const parsedText =
      payload.output_text?.trim() ??
      payload.output
        ?.flatMap((o) => o.content ?? [])
        .map((c) => c.text ?? '')
        .join('')
        .trim();

    if (!parsedText) {
      return res.status(502).json({ error: 'No text returned from Responses API.' });
    }

    const parsedJson = tryParseJsonObject(parsedText);
    const changed = typeof parsedJson?.changed === 'boolean' ? (parsedJson.changed as boolean) : true;
    const board = typeof parsedJson?.board === 'string' ? parsedJson.board.trim() : parsedText;

    if (!board) {
      return res.status(502).json({ error: 'No HUD board returned from Responses API.' });
    }

    return res.json({ changed, board });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to call Responses API';
    return res.status(500).json({ error: msg });
  }
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

wss.on('connection', (clientWs, req) => {
  console.log('[server] Client connected to Realtime proxy');

  const requestUrl = new URL(req.url ?? '/api/realtime', `http://localhost:${PORT}`);
  const realtimeModel = pickRealtimeModel(requestUrl.searchParams.get('model') ?? undefined);
  const realtimeInterface = pickRealtimeInterface(requestUrl.searchParams.get('realtime_interface') ?? undefined);

  const openaiWs = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${realtimeModel}`,
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        ...(realtimeInterface === 'beta' ? { 'OpenAI-Beta': 'realtime=v1' } : {}),
      },
    }
  );

  let openaiReady = false;
  const pendingMessages: Buffer[] = [];

  openaiWs.on('open', () => {
    openaiReady = true;
    console.log(`[server] Connected to OpenAI Realtime API (${realtimeModel}, ${realtimeInterface})`);
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
    const reasonText = reason.toString();
    console.log(`[server] OpenAI WebSocket closed: ${code} ${reasonText}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      if (code !== 1000) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            error: {
              message: `OpenAI Realtime socket closed (code=${code}${reasonText ? `, reason=${reasonText}` : ''}, model=${realtimeModel}, interface=${realtimeInterface})`,
            },
          })
        );
      }
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
  const url = new URL(req.url ?? '', `http://localhost:${PORT}`);
  if (url.pathname === '/api/realtime') {
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
  console.log(`[server] Realtime interface: ${OPENAI_REALTIME_INTERFACE}`);
  console.log(`[server] WebSocket proxy: ws://localhost:${PORT}/api/realtime`);
});
