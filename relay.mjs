import { WebSocketServer } from 'ws';
import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';
import http from 'http';

const PORT = process.env.PORT || 8080;

// 1. Create a raw HTTP server and force it to bind to 0.0.0.0
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Relay is healthy\n');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP Server bound to 0.0.0.0:${PORT}`);
});

// 2. Attach the WebSocket server to the running HTTP server
const wss = new WebSocketServer({ server });
const swarm = new Hyperswarm();
const topic = crypto.createHash('sha256').update('automerge-global-lobby-v1').digest();
const peers = new Set();

swarm.join(topic, { server: true, client: true });
console.log('Joined Hyperswarm Global Lobby...');

swarm.on('connection', (conn) => {
  peers.add(conn);
  console.log(`New P2P connection established. Total peers: ${peers.size}`);
  
  conn.on('data', data => {
    wss.clients.forEach(ws => ws.send(data)); 
  });
  
  conn.on('close', () => peers.delete(conn));
  conn.on('error', () => peers.delete(conn));
});

wss.on('connection', (ws) => {
  console.log('React app connected to Relay.');
  
  ws.on('message', (msg, isBinary) => {
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === 1) {
        client.send(msg, { binary: isBinary });
      }
    });

    for (const peer of peers) {
      peer.write(msg);
    }
  });
});