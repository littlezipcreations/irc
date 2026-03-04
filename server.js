// Tiny IRC‑style chat server (Node.js + ws)
// -------------------------------------------------
const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;          // you can change 8080 if needed
const HISTORY_FILE = path.join(__dirname, 'history.json');
const MAX_HISTORY = 100;                        // keep last 100 messages

// ----- serve static files from ./public -----
const app = express();
app.use(express.static('public'));

// ----- HTTP + WebSocket server -----
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// ----- in‑memory state -----
let clients = new Map();               // ws → {nick, channel}
let history = [];

// Load recent history if it exists
if (fs.existsSync(HISTORY_FILE)) {
  try { history = JSON.parse(fs.readFileSync(HISTORY_FILE)); } catch (_) {}
}

// Helper: broadcast a JSON payload to everyone in a channel
function broadcast(chan, payload) {
  const msg = JSON.stringify(payload);
  for (const [ws, info] of clients) {
    if (info.channel === chan && ws.readyState === ws.OPEN) ws.send(msg);
  }
}

// Save the history array to disk (non‑blocking)
function saveHistory() { fs.writeFile(HISTORY_FILE, JSON.stringify(history), () => {}); }

// ----- WebSocket connection handling -----
wss.on('connection', ws => {
  const info = { nick: `guest${Math.floor(Math.random()*1000)}`, channel: 'lobby' };
  clients.set(ws, info);

  // Tell the new client its nick/channel and recent messages
  ws.send(JSON.stringify({ type: 'welcome', nick: info.nick, channel: info.channel }));
  ws.send(JSON.stringify({ type: 'history', messages: history }));

  // Announce the join
  broadcast(info.channel, { type: 'info', text: `${info.nick} has joined ${info.channel}` });

  ws.on('message', raw => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    if (data.type !== 'text' || typeof data.text !== 'string') return;

    const txt = data.text.trim();

    // ----- commands (start with "/") -----
    if (txt.startsWith('/')) {
      const parts = txt.slice(1).split(' ');
      const cmd = parts[0].toLowerCase();

      if (cmd === 'nick') {
        const old = info.nick;
        const newNick = parts[1] ? parts[1].replace(/[^\w[\]{}^`|]/g, '') : old;
        info.nick = newNick;
        ws.send(JSON.stringify({ type: 'info', text: `Your nick is now ${newNick}` }));
        broadcast(info.channel, { type: 'info', text: `${old} is now known as ${newNick}` });
        return;
      }

      if (cmd === 'join') {
        const newChan = parts[1] || 'lobby';
        if (newChan !== info.channel) {
          broadcast(info.channel, { type: 'info', text: `${info.nick} left ${info.channel}` });
          info.channel = newChan;
          ws.send(JSON.stringify({ type: 'info', text: `Joined ${newChan}` }));
          broadcast(info.channel, { type: 'info', text: `${info.nick} joined ${newChan}` });
        }
        return;
      }

      if (cmd === 'msg') {
        const target = parts[1];
        const pm = parts.slice(2).join(' ');
        if (!target || !pm) {
          ws.send(JSON.stringify({ type: 'error', text: 'Usage: /msg nick message' }));
          return;
        }
        for (const [otherWs, otherInfo] of clients) {
          if (otherInfo.nick === target) {
            const payload = { type: 'pm', from: info.nick, text: pm };
            ws.send(JSON.stringify(payload));
            otherWs.send(JSON.stringify(payload));
            break;
          }
        }
        return;
      }

      if (cmd === 'quit') {
        ws.close();
        return;
      }

      // unknown command
      ws.send(JSON.stringify({ type: 'error', text: `Unknown command: ${cmd}` }));
      return;
    }

    // ----- normal chat line -----
    const chat = {
      type: 'chat',
      nick: info.nick,
      channel: info.channel,
      text: txt,
      ts: Date.now()
    };
    history.push(chat);
    if (history.length > MAX_HISTORY) history.shift();
    saveHistory();
    broadcast(info.channel, chat);
  });

  ws.on('close', () => {
    broadcast(info.channel, { type: 'info', text: `${info.nick} has left ${info.channel}` });
    clients.delete(ws);
  });
});

// Start listening
httpServer.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
