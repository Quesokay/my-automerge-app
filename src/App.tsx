import { useState, useEffect, useRef } from 'react';
import { 
  Star, Share, MessageSquare, Video, Search, 
  Undo, Redo, Printer, Bold, Italic, Underline, 
  AlignLeft, AlignCenter, AlignRight, FileText
} from 'lucide-react';

// ProseMirror Imports
import { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark, setBlockType } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { schema } from 'prosemirror-schema-basic';

// Automerge Repo Imports
import { AutomergeUrl } from "@automerge/automerge-repo";
import { useDocHandle } from "@automerge/automerge-repo-react-hooks";
import { init } from "@automerge/prosemirror";

import './App.css';

const Header = () => (
  <header className="docs-header">
    <div className="header-brand">
      <div className="docs-logo">
        <FileText size={40} fill="#1a73e8" color="white" strokeWidth={1} />
      </div>
      <div className="header-meta">
        <div className="doc-title-row">
          <input type="text" className="doc-title-input" defaultValue="Untitled document" />
          <Star size={16} className="text-muted cursor-pointer" />
        </div>
        <nav className="doc-menu">
          {['File', 'Edit', 'View', 'Insert', 'Format', 'Tools', 'Help'].map(item => (
            <button key={item} className="menu-btn">{item}</button>
          ))}
        </nav>
      </div>
    </div>
    <div className="header-actions">
      <button className="icon-btn"><MessageSquare size={18} /></button>
      <button className="icon-btn"><Video size={18} /></button>
      <button className="share-btn"><Share size={16} /> Share</button>
      <div className="avatar">D</div>
    </div>
  </header>
);

const isMarkActive = (state: EditorState | null, markType: any) => {
  if (!state) return false;
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!markType.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, markType);
};

const Toolbar = ({ view, editorState }: { view: EditorView | null, editorState: EditorState | null }) => {
  const applyMark = (markType: any) => {
    if (!view) return;
    toggleMark(markType)(view.state, view.dispatch);
    view.focus(); 
  };

  const handleBlockTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!view) return;
    const val = e.target.value;
    if (val === '0') {
      setBlockType(schema.nodes.paragraph)(view.state, view.dispatch);
    } else {
      setBlockType(schema.nodes.heading, { level: parseInt(val) })(view.state, view.dispatch);
    }
    view.focus();
  };

  const boldActive = isMarkActive(editorState, schema.marks.strong);
  const italicActive = isMarkActive(editorState, schema.marks.em);

  let currentBlock = '0';
  if (editorState) {
    const { $from } = editorState.selection;
    if ($from.parent.type.name === 'heading') currentBlock = $from.parent.attrs.level.toString();
  }

  return (
    <div className="docs-toolbar">
      <div className="toolbar-group">
        <button className="icon-btn"><Search size={16} /></button>
        <button className="icon-btn" onClick={() => view && undo(view.state, view.dispatch)}><Undo size={16} /></button>
        <button className="icon-btn" onClick={() => view && redo(view.state, view.dispatch)}><Redo size={16} /></button>
        <button className="icon-btn"><Printer size={16} /></button>
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <select className="toolbar-select" value={currentBlock} onChange={handleBlockTypeChange}>
          <option value="0">Normal text</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        <select className="toolbar-select"><option>Arial</option><option>Inter</option></select>
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button className={`icon-btn ${boldActive ? 'active' : ''}`} onClick={() => applyMark(schema.marks.strong)}><Bold size={16} /></button>
        <button className={`icon-btn ${italicActive ? 'active' : ''}`} onClick={() => applyMark(schema.marks.em)}><Italic size={16} /></button>
        <button className="icon-btn"><Underline size={16} /></button>
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button className="icon-btn"><AlignLeft size={16} /></button>
        <button className="icon-btn"><AlignCenter size={16} /></button>
        <button className="icon-btn"><AlignRight size={16} /></button>
      </div>
    </div>
  );
};

const Sidebar = () => (
  <aside className="docs-sidebar">
    <div className="sidebar-header">
      <span className="font-semibold">Document outline</span>
    </div>
    <div className="sidebar-content text-muted text-sm">
      Headings you add to the document will appear here.
    </div>
  </aside>
);

// --- 1. Define the Cursor Plugin ---
const cursorPluginKey = new PluginKey('cursors');

const cursorPlugin = () => new Plugin({
  key: cursorPluginKey,
  state: {
    init() { return { cursors: {} }; },
    apply(tr, pluginState) {
      const meta = tr.getMeta(cursorPluginKey);
      let { cursors } = pluginState;
      
      // If we receive a cursor update, merge it into our state
      if (meta) {
        cursors = { ...cursors, [meta.clientId]: meta };
      }
      return { cursors };
    }
  },
  props: {
    // This physically draws the HTML elements onto the ProseMirror canvas
    decorations(state) {
      const { cursors } = cursorPluginKey.getState(state);
      const decos: Decoration[] = [];
      
      Object.values(cursors).forEach((c: any) => {
        // Prevent crashing if a remote cursor index is temporarily out of bounds during a sync
        const safePos = Math.max(0, Math.min(c.pos, state.doc.content.size));
        
        const widget = document.createElement('span');
        widget.className = 'remote-cursor';
        widget.style.borderLeftColor = c.color;
        
        const flag = document.createElement('span');
        flag.className = 'remote-cursor-flag';
        flag.style.backgroundColor = c.color;
        flag.innerText = c.name;
        
        widget.appendChild(flag);
        decos.push(Decoration.widget(safePos, widget, { side: 1 }));
      });
      
      return DecorationSet.create(state.doc, decos);
    }
  }
});

const ProseMirrorEditor = ({ 
  docUrl, 
  onViewCreated,
  onStateChange
}: { 
  docUrl: AutomergeUrl;
  onViewCreated: (view: EditorView | null) => void;
  onStateChange: (state: EditorState) => void;
}) => {
  const editorRoot = useRef<HTMLDivElement>(null);
  const handle = useDocHandle<{ text: string }>(docUrl);
  const [loaded, setLoaded] = useState(false);

  // Generate random identity for this session
  const myClientId = useRef(Math.random().toString(36).substr(2, 9)).current;
  const myColor = useRef(['#ff5722', '#4caf50', '#2196f3', '#e91e63', '#9c27b0'][Math.floor(Math.random() * 5)]).current;
  const myName = useRef(`User ${Math.floor(Math.random() * 1000)}`).current;

  useEffect(() => {
    if (handle) {
      handle.whenReady().then(() => {
        if (handle.docSync() != null) setLoaded(true);
      });
    }
  }, [handle]);

  useEffect(() => {
    if (!editorRoot.current || !loaded || !handle) return;

    const { pmDoc, schema, plugin } = init(handle, ["text"]);

    const state = EditorState.create({
      schema,
      doc: pmDoc,
      plugins: [
        history(),
        keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo }),
        keymap(baseKeymap),
        plugin,
        cursorPlugin() // Inject the cursor plugin
      ]
    });

    const view = new EditorView(editorRoot.current, { 
      state,
      dispatchTransaction(transaction) {
        const newState = view.state.apply(transaction);
        view.updateState(newState);
        onStateChange(newState);

        // --- 2. Broadcast cursor when our selection changes ---
        if (transaction.selectionSet) {
          handle.broadcast({
            type: 'cursor',
            clientId: myClientId,
            pos: newState.selection.head,
            name: myName,
            color: myColor
          });
        }
      }
    });

    // --- 3. Listen for incoming cursors from other users ---
    const onMessage = (msg: any) => {
      const data = msg.message; 
      if (data && data.type === 'cursor' && data.clientId !== myClientId) {
        // Dispatch an empty transaction purely to update the cursor plugin state
        const tr = view.state.tr.setMeta(cursorPluginKey, data);
        view.dispatch(tr);
      }
    };
    
    handle.on("ephemeral-message", onMessage);
    
    onViewCreated(view);
    onStateChange(state);

    return () => {
      handle.off("ephemeral-message", onMessage);
      onViewCreated(null);
      view.destroy();
    };
  }, [loaded, handle, onViewCreated, onStateChange]);

  return <div ref={editorRoot} className="prosemirror-mount" />;
};

export default function App({ docUrl }: { docUrl: AutomergeUrl }) {
  const [sidebarOpen] = useState(true);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);

  return (
    <div className="app-container">
      <Header />
      <Toolbar view={editorView} editorState={editorState} />
      <main className="main-workspace">
        {sidebarOpen && <Sidebar />}
        <section className="editor-container">
          <div className="document-page">
            <ProseMirrorEditor 
              docUrl={docUrl} 
              onViewCreated={setEditorView}
              onStateChange={setEditorState}
            />
          </div>
        </section>
      </main>
    </div>
  );
}