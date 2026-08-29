import { Repo } from "@automerge/automerge-repo"
import { BroadcastChannelNetworkAdapter } from "@automerge/automerge-repo-network-broadcastchannel"
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb"
import { RepoContext } from "@automerge/automerge-repo-react-hooks"
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App.tsx"
import "./index.css"
import { getOrCreateRoot } from "./rootDoc"
import { MeshAdapter } from "./MeshAdapter"


export const repo = new Repo({
  storage: new IndexedDBStorageAdapter("automerge-final"),
  network: [
    new MeshAdapter("wss://https://my-automerge-app.fly.dev"),
    new BroadcastChannelNetworkAdapter(),
  ],
})

export const goOffline = () => { console.log("Offline mode") }
export const goOnline = () => { console.log("Online mode") }

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