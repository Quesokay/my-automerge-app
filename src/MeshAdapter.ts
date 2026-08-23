import { NetworkAdapter, PeerId } from "@automerge/automerge-repo";

export class MeshAdapter extends NetworkAdapter {
  private socket: WebSocket | null = null;
  private url: string;
  
  // New Promise-based lifecycle variables required by Automerge
  private _isReady = false;
  private _readyPromise: Promise<void>;
  private _resolveReady!: () => void;

  constructor(url: string) {
    super();
    this.url = url;
    
    // Initialize the Promise that Automerge will await
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });
  }

  // Required by Automerge: Synchronous check for connection state
  isReady(): boolean {
    return this._isReady;
  }

  // Required by Automerge: Asynchronous wait for connection
  whenReady(): Promise<void> {
    return this._readyPromise;
  }

  connect(peerId: PeerId) {
    this.peerId = peerId;
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      // 1. Resolve the network lifecycle promises instead of emitting a "ready" event
      this._isReady = true;
      this._resolveReady();
      
      // 2. Announce this repo's presence to the mesh to trigger handshakes
      this.socket?.send(JSON.stringify({ type: "mesh-join", senderId: this.peerId }));
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "mesh-join" && data.senderId !== this.peerId) {
          this.emit("peer-candidate", { peerId: data.senderId, peerMetadata: {} });
          this.socket?.send(JSON.stringify({ type: "mesh-reply", senderId: this.peerId, targetId: data.senderId }));
        }
        else if (data.type === "mesh-reply" && data.targetId === this.peerId) {
          this.emit("peer-candidate", { peerId: data.senderId, peerMetadata: {} });
        }
        else if (data.type === "mesh-leave") {
          this.emit("peer-disconnected", { peerId: data.senderId });
        }
        else if (data.type === "sync" || data.type === "ephemeral") {
          if (data.targetId === this.peerId || !data.targetId) {
            this.emit("message", {
              type: data.type,
              senderId: data.senderId,
              targetId: data.targetId,
              data: new Uint8Array(data.payload), 
            });
          }
        }
      } catch (e) {
        // Silently ignore non-JSON or unrelated Lobby packets
      }
    };
  }

  disconnect() {
    this.socket?.send(JSON.stringify({ type: "mesh-leave", senderId: this.peerId }));
    this.socket?.close();
  }

  send(message: any) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    
    this.socket.send(
      JSON.stringify({
        type: message.type,
        senderId: this.peerId,
        targetId: message.targetId,
        payload: message.data ? Array.from(message.data) : [],
      })
    );
  }
}