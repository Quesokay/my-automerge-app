import { WebSocketServer } from 'ws';
import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';

// Use Fly.io's environment port if available, otherwise fallback to 3031
const PORT = process.env.PORT || 8080;

// Bind to 0.0.0.0 so the Fly edge proxy can route external traffic to this container
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });
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

console.log(`WebSocket Relay running on port ${PORT}`);