import {  Repo } from "@automerge/automerge-repo"
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket"
import { BroadcastChannelNetworkAdapter } from "@automerge/automerge-repo-network-broadcastchannel"
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb"
import { RepoContext } from "@automerge/automerge-repo-react-hooks"
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App.tsx"
import "./index.css"
import { getOrCreateRoot } from "./rootDoc"

// Instantiate the WebSocket adapter so we can control it globally
const wsAdapter = new BrowserWebSocketClientAdapter("wss://sync.automerge.org")

export const repo = new Repo({
  storage: new IndexedDBStorageAdapter("automerge"),
  network: [
    wsAdapter,
    new BroadcastChannelNetworkAdapter(),
  ],
})

// Helper functions to toggle connection state cleanly
export const goOffline = () => {
  wsAdapter.disconnect()
}

export const goOnline = () => {
  wsAdapter.connect(repo.peerId)
}

const rootDocUrl = getOrCreateRoot(repo)

// @ts-expect-error -- we put the handle and the repo on window so you can experiment with them from the dev tools
window.repo = repo

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RepoContext.Provider value={repo}>
      <App rootDocUrl={rootDocUrl} />
    </RepoContext.Provider>
  </React.StrictMode>,
)