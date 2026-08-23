import { WebSocketServer } from 'ws';
import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';

const wss = new WebSocketServer({ port: 3031 });
const swarm = new Hyperswarm();
const topic = crypto.createHash('sha256').update('automerge-global-lobby-v1').digest();
const peers = new Set();

swarm.join(topic, { server: true, client: true });
console.log('Joined Hyperswarm Global Lobby...');

swarm.on('connection', (conn) => {
  peers.add(conn);
  console.log(`New P2P connection established. Total peers: ${peers.size}`);
  
  conn.on('data', data => {
    // FIX 1: Pass the raw buffer, do NOT use .toString()
    wss.clients.forEach(ws => ws.send(data)); 
  });
  
  conn.on('close', () => peers.delete(conn));
  conn.on('error', () => peers.delete(conn));
});

wss.on('connection', (ws) => {
  console.log('Local React app connected to Relay.');
  
  // FIX 2: Check if the incoming message is binary or text, and preserve it
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

console.log('WebSocket Relay running on ws://localhost:3031');