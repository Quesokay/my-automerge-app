import { isValidAutomergeUrl, Repo } from "@automerge/automerge-repo"
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket"
import { BroadcastChannelNetworkAdapter } from "@automerge/automerge-repo-network-broadcastchannel"
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb"
import { RepoContext } from "@automerge/automerge-repo-react-hooks"
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App.tsx"
import "./index.css"
import { getOrCreateRoot } from "./rootDoc";

const repo = new Repo({
  network: [
    new BrowserWebSocketClientAdapter("wss://sync.automerge.org"),
    new BroadcastChannelNetworkAdapter(),
  ],
  storage: new IndexedDBStorageAdapter("automerge"),
})

const rootDocUrl = getOrCreateRoot(repo);
let handle
if (isValidAutomergeUrl(rootDocUrl)) {
  handle = await repo.find(rootDocUrl)
} else {
  handle = repo.create({ text: "hello world" })
}
// @ts-expect-error -- we put the handle and the repo on window so you can experiment with them from the dev tools
window.handle = handle // we'll use this later for experimentation
// @ts-expect-error -- we put the handle and the repo on window so you can experiment with them from the dev tools
window.repo = repo

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RepoContext.Provider value={repo}>
      <App rootDocUrl={rootDocUrl} />
    </RepoContext.Provider>
  </React.StrictMode>,
)
