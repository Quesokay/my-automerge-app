import { Repo } from "@automerge/automerge-repo"
import { BroadcastChannelNetworkAdapter } from "@automerge/automerge-repo-network-broadcastchannel"
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb"
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { RepoContext } from "@automerge/automerge-repo-react-hooks"
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App.tsx"
import "./index.css"
import { getOrCreateRoot } from "./rootDoc"

// Isolate the adapter so goOnline/goOffline toggles work
const wsAdapter = new BrowserWebSocketClientAdapter("wss://my-automerge-app.fly.dev/sync");

export const repo = new Repo({
  storage: new IndexedDBStorageAdapter("automerge-final"),
  network: [wsAdapter, new BroadcastChannelNetworkAdapter()],
});

export const goOffline = () => { 
  wsAdapter.disconnect();
  console.log("Severed WSS connection. Working strictly local."); 
}

export const goOnline = () => { 
  wsAdapter.connect(repo.networkSubsystem.peerId);
  console.log("Reconnected to WSS relay. Syncing changes..."); 
}

const rootDocUrl = getOrCreateRoot(repo)

// @ts-expect-error -- window hook
window.repo = repo

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RepoContext.Provider value={repo}>
      <App rootDocUrl={rootDocUrl} />
    </RepoContext.Provider>
  </React.StrictMode>,
)