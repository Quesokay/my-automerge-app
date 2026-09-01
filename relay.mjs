import http from 'http';
import { WebSocketServer } from 'ws';
import { Repo } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';

const PORT = process.env.PORT || 8080;

// 1. Create the core HTTP server (The Traffic Cop)
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Dual-Socket Relay is healthy\n');
});

// 2. Create TWO completely isolated WebSocket networks
const syncWss = new WebSocketServer({ noServer: true });
const lobbyWss = new WebSocketServer({ noServer: true });

// 3. Attach Automerge ONLY to the Sync WebSocket
const repo = new Repo({
  network: [new NodeWSServerAdapter(syncWss)],
});

// 4. Attach Hyperswarm ONLY to the Lobby WebSocket
const swarm = new Hyperswarm();
const topic = crypto.createHash('sha256').update('automerge-global-lobby-v2').digest();
const hyperswarmPeers = new Set();

swarm.join(topic, { server: true, client: true });
console.log('Hyperswarm monitoring global lobby topic...');

swarm.on('connection', (conn) => {
  hyperswarmPeers.add(conn);
  
  // Forward Hyperswarm P2P events to the React UI Lobby
  conn.on('data', data => {
    lobbyWss.clients.forEach(ws => {
      if (ws.readyState === 1) ws.send(data.toString());
    });
  });
  
  conn.on('close', () => hyperswarmPeers.delete(conn));
  conn.on('error', () => hyperswarmPeers.delete(conn));
});

// Handle incoming JSON from the React UI and broadcast it
lobbyWss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    const textMsg = msg.toString();
    
    // Bounce message to all other connected React clients
    lobbyWss.clients.forEach(client => {
      if (client !== ws && client.readyState === 1) {
        client.send(textMsg);
      }
    });

    // Bounce message to external P2P Hyperswarm nodes
    for (const peer of hyperswarmPeers) {
      peer.write(textMsg);
    }
  });
});

// 5. Route incoming connections based on the URL path
server.on('upgrade', (request, socket, head) => {
  if (request.url === '/sync') {
    syncWss.handleUpgrade(request, socket, head, (ws) => {
      syncWss.emit('connection', ws, request);
    });
  } else if (request.url === '/lobby') {
    lobbyWss.handleUpgrade(request, socket, head, (ws) => {
      lobbyWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy(); // Reject unknown connections
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Dual-Socket Relay running on port ${PORT}`);
  console.log(`Automerge Sync: /sync`);
  console.log(`Presence Lobby: /lobby`);
});