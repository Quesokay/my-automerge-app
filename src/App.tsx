import { AutomergeUrl } from "@automerge/automerge-repo"
import { useDocHandle, usePresence } from "@automerge/automerge-repo-react-hooks"
import { useEffect, useRef } from "react"
import { EditorState, Transaction, Plugin, PluginKey } from "prosemirror-state"
import { EditorView, Decoration, DecorationSet } from "prosemirror-view"
import { exampleSetup } from "prosemirror-example-setup"
import { init, basicSchemaAdapter } from "@automerge/prosemirror"
import "prosemirror-example-setup/style/style.css"
import "prosemirror-menu/style/menu.css"
import "prosemirror-view/style/prosemirror.css"
import "./App.css"

interface CursorInfo {
  pos: number
  name: string
  color: string
}

type PresenceState = {
  cursor: CursorInfo
}

const cursorPluginKey = new PluginKey("remote-cursors")

function getStableLocalUser() {
  const storageKey = "automerge-prosemirror-cursor-user"
  const palette = ["#ff5733", "#00b4d8", "#9b5de5", "#f15bb5", "#00f5d4"]

  const saved = localStorage.getItem(storageKey)
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as { name: string; color: string }
      if (parsed?.name && parsed?.color) {
        return parsed
      }
    } catch {
      // Ignore invalid storage values and generate a fresh identity.
    }
  }

  const user = {
    name: "User_" + Math.floor(Math.random() * 1000),
    color: palette[Math.floor(Math.random() * palette.length)],
  }

  localStorage.setItem(storageKey, JSON.stringify(user))
  return user
}

function createCursorWidget(name: string, color: string) {
  const dom = document.createElement("span")
  dom.className = "remote-cursor-container"

  const cursorBar = document.createElement("span")
  cursorBar.className = "remote-cursor-bar"
  cursorBar.style.borderLeftColor = color

  const label = document.createElement("span")
  label.className = "remote-cursor-label"
  label.style.backgroundColor = color
  label.innerText = name

  dom.appendChild(cursorBar)
  dom.appendChild(label)
  return dom
}

function createCursorPlugin(
  updatePresence: (channel: "cursor", value: CursorInfo) => void,
  localUser: { name: string; color: string }
) {
  return new Plugin({
    key: cursorPluginKey,
    state: {
      init() {
        return DecorationSet.empty
      },
      apply(tr, set, _oldState, newState) {
        // Keeps cursors tied to text changes
        set = set.map(tr.mapping, tr.doc)

        const meta = tr.getMeta(cursorPluginKey)
        if (meta) {
          const decorations: Decoration[] = []
          Object.entries(meta as Record<string, CursorInfo>).forEach(([_, cursor]) => {
            if (cursor.pos <= newState.doc.content.size) {
              decorations.push(
                Decoration.widget(cursor.pos, createCursorWidget(cursor.name, cursor.color))
              )
            }
          })
          return DecorationSet.create(newState.doc, decorations)
        }
        return set
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)
      },
    },
    view() {
      return {
        update(view, lastState) {
          const { selection } = view.state
          if (lastState && lastState.selection.eq(selection)) return

          updatePresence("cursor", {
            pos: selection.head,
            name: localUser.name,
            color: localUser.color,
          })
        },
      }
    },
  })
}

function App({ docUrl }: { docUrl: AutomergeUrl }) {
  const editorRoot = useRef<HTMLDivElement>(null)
  const handle = useDocHandle<{ text: string }>(docUrl)
  const viewRef = useRef<EditorView | null>(null)

  // Stable identity for the current browser profile
  const localUser = useRef(getStableLocalUser())

  const { peerStates, update } = usePresence<PresenceState>({
    handle: handle!,
    initialState: {
      cursor: {
        pos: 0,
        name: localUser.current.name,
        color: localUser.current.color,
      },
    },
  })

  // Watch for presence updates and safely push them into the editor state
  useEffect(() => {
    if (!viewRef.current) return

    const remoteCursors: Record<string, CursorInfo> = {}
    Object.entries(peerStates.value).forEach(([peerId, peerState]) => {
      const cursor = peerState.value.cursor
      if (cursor) {
        remoteCursors[peerId] = cursor
      }
    })

    const tr = viewRef.current.state.tr.setMeta(cursorPluginKey, remoteCursors)
    viewRef.current.dispatch(tr)
  }, [peerStates])

  useEffect(() => {
    let view: EditorView

    if (editorRoot.current != null && handle != null) {
      const { pmDoc, schema, plugin } = init(handle, ["text"], {
        schemaAdapter: basicSchemaAdapter,
      })

      const liveCursorPlugin = createCursorPlugin(update, localUser.current)

      view = new EditorView(editorRoot.current, {
        state: EditorState.create({
          schema,
          plugins: [...exampleSetup({ schema }), plugin, liveCursorPlugin],
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          doc: pmDoc,
        }),
        dispatchTransaction: (tx: Transaction) => {
          view!.updateState(view.state.apply(tx))
        },
      })

      viewRef.current = view
    }
    return () => {
      if (view != null) {
        view.destroy()
        viewRef.current = null
      }
    }
  }, [editorRoot, handle])

  return <div id="editor" ref={editorRoot}></div>
}

export default App
