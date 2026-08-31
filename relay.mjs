import { WebSocketServer } from 'ws';
import { Repo } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';

const PORT = process.env.PORT || 8080;

// 1. Create a standard WebSocket server bound to 0.0.0.0 for Fly.io
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

// 2. Initialize the Automerge Repo with the official Node adapter
const repo = new Repo({
  network: [new NodeWSServerAdapter(wss)],
  // No storage adapter means this is purely a lightweight relay!
});

console.log(`🚀 Official Automerge relay running on port ${PORT}`);