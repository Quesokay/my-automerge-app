import { useState, useEffect, useRef } from 'react';
import { 
  Star, Share, MessageSquare, Video, Search, 
  Undo, Redo, Printer, Bold, Italic, Underline, 
  AlignLeft, AlignCenter, AlignRight, FileText, Send
} from 'lucide-react';

// ProseMirror Imports
import { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark, setBlockType } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';

// Automerge Repo Imports
import { AutomergeUrl, isValidAutomergeUrl } from "@automerge/automerge-repo";
import { useRepo, useDocument, useDocHandle } from "@automerge/automerge-repo-react-hooks";
import { init } from "@automerge/prosemirror";
import { useHash } from "react-use";
import { RootDocument } from "./rootDoc";

import './App.css';

// --- Updated Header with Chat Toggle ---
const Header = ({ 
  title, 
  onTitleChange, 
  onToggleChat, 
  chatOpen 
}: { 
  title: string; 
  onTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleChat: () => void;
  chatOpen: boolean;
}) => {
  const [copied, setCopied] = useState(false);

  const handleShareClick = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); 
    });
  };

  return (
    <header className="docs-header">
      <div className="header-brand">
        <div className="docs-logo">
          <FileText size={40} fill="#1a73e8" color="white" strokeWidth={1} />
        </div>
        <div className="header-meta">
          <div className="doc-title-row">
            <input 
              type="text" 
              className="doc-title-input" 
              value={title} 
              onChange={onTitleChange} 
              placeholder="Untitled document"
            />
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
        {/* Chat toggle button */}
        <button className={`icon-btn ${chatOpen ? 'active' : ''}`} onClick={onToggleChat} title="Toggle Chat">
          <MessageSquare size={18} />
        </button>
        <button className="icon-btn"><Video size={18} /></button>
        <button className="share-btn" onClick={handleShareClick}>
          <Share size={16} /> {copied ? "Copied!" : "Share"}
        </button>
        <div className="avatar">D</div>
      </div>
    </header>
  );
};

const isMarkActive = (state: EditorState | null, markType: any) => {
  if (!state) return false;
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!markType.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, markType);
};

const Toolbar = ({ view, editorState }: { view: EditorView | null, editorState: EditorState | null }) => {
  const activeSchema = editorState?.schema;

  const applyMark = (markName: string) => {
    if (!view || !activeSchema || !activeSchema.marks[markName]) return;
    toggleMark(activeSchema.marks[markName])(view.state, view.dispatch);
    view.focus(); 
  };

  const handleBlockTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!view || !activeSchema) return;
    const val = e.target.value;
    if (val === '0') {
      setBlockType(activeSchema.nodes.paragraph)(view.state, view.dispatch);
    } else {
      setBlockType(activeSchema.nodes.heading, { level: parseInt(val) })(view.state, view.dispatch);
    }
    view.focus();
  };

  const boldActive = activeSchema && activeSchema.marks.strong ? isMarkActive(editorState, activeSchema.marks.strong) : false;
  const italicActive = activeSchema && activeSchema.marks.em ? isMarkActive(editorState, activeSchema.marks.em) : false;

  let currentBlock = '0';
  if (editorState && activeSchema) {
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
        <select className="toolbar-select"><option value="Arial">Arial</option></select>
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button className={`icon-btn ${boldActive ? 'active' : ''}`} onClick={() => applyMark('strong')}><Bold size={16} /></button>
        <button className={`icon-btn ${italicActive ? 'active' : ''}`} onClick={() => applyMark('em')}><Italic size={16} /></button>
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

// --- PushPin Chat Thread Component ---
type ChatMessage = {
  id: string;
  author: string;
  text: string;
  timestamp: number;
};

const ChatDrawer = ({ docUrl }: { docUrl: AutomergeUrl }) => {
  const [doc, changeDoc] = useDocument<{ messages?: ChatMessage[] }>(docUrl);
  const [inputVal, setInputVal] = useState('');
  
  // Stable random user identity for chat messages
  const myName = useRef(`User ${Math.floor(Math.random() * 1000)}`).current;

  const messages = doc?.messages || [];

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    const newMessage: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      author: myName,
      text: inputVal.trim(),
      timestamp: Date.now(),
    };

    changeDoc((d) => {
      if (!d.messages) d.messages = [];
      d.messages.push(newMessage);
    });

    setInputVal('');
  };

  return (
    <aside className="chat-drawer">
      <div className="chat-header">
        <span className="font-semibold">Document Discussion</span>
      </div>
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="text-muted text-sm" style={{ padding: '16px', textAlign: 'center' }}>
            No comments yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="chat-bubble">
              <div className="chat-meta">
                <span className="chat-author">{msg.author}</span>
                <span className="chat-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="chat-text">{msg.text}</div>
            </div>
          ))
        )}
      </div>
      <form onSubmit={handleSendMessage} className="chat-input-row">
        <input 
          type="text" 
          className="chat-input" 
          placeholder="Add a comment..." 
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
        />
        <button type="submit" className="icon-btn chat-send-btn"><Send size={14} /></button>
      </form>
    </aside>
  );
};

const DocumentTitle = ({ docUrl }: { docUrl: AutomergeUrl }) => {
  const [doc] = useDocument<{ title?: string }>(docUrl);
  return <span>{doc?.title || "Untitled document"}</span>;
};

const Sidebar = ({ 
  rootDocUrl, 
  selectedDocUrl, 
  onSelect 
}: { 
  rootDocUrl: AutomergeUrl, 
  selectedDocUrl: AutomergeUrl | null, 
  onSelect: (url: AutomergeUrl) => void 
}) => {
  const repo = useRepo();
  const [rootDoc, changeRootDoc] = useDocument<RootDocument>(rootDocUrl);
  const documents = rootDoc?.documents || [];

  useEffect(() => {
    if (selectedDocUrl) {
      changeRootDoc((d) => {
        if (!d.documents) d.documents = [];
        if (!d.documents.includes(selectedDocUrl)) {
          d.documents.push(selectedDocUrl);
        }
      });
    }
  }, [selectedDocUrl, changeRootDoc]);

  const handleNewDocument = () => {
    const newDoc = repo.create({ text: "", title: "Untitled document", messages: [] });
    changeRootDoc(d => {
      if (!d.documents) d.documents = [];
      d.documents.push(newDoc.url);
    });
    onSelect(newDoc.url);
  };

  return (
    <aside className="docs-sidebar">
      <div className="sidebar-header">
        <span className="font-semibold">My Documents</span>
        <button className="icon-btn" onClick={handleNewDocument}>+</button>
      </div>
      <div className="sidebar-content">
        <div className="outline-list">
          {documents.map(url => (
            <div 
              key={url} 
              className={`outline-item ${url === selectedDocUrl ? 'active' : ''}`}
              onClick={() => onSelect(url as AutomergeUrl)}
            >
              📄 <DocumentTitle docUrl={url as AutomergeUrl} />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};

const cursorPluginKey = new PluginKey('cursors');

const cursorPlugin = () => new Plugin({
  key: cursorPluginKey,
  state: {
    init() { return { cursors: {} }; },
    apply(tr, pluginState) {
      const meta = tr.getMeta(cursorPluginKey);
      let { cursors } = pluginState;
      if (meta) {
        cursors = { ...cursors, [meta.clientId]: meta };
      }
      return { cursors };
    }
  },
  props: {
    decorations(state) {
      const { cursors } = cursorPluginKey.getState(state);
      const decos: Decoration[] = [];
      const docSize = state.doc.content.size;
      
      Object.values(cursors).forEach((c: any) => {
        const safeHead = Math.max(0, Math.min(c.head, docSize));
        const safeAnchor = Math.max(0, Math.min(c.anchor, docSize));
        
        if (safeHead !== safeAnchor) {
          const from = Math.min(safeHead, safeAnchor);
          const to = Math.max(safeHead, safeAnchor);
          decos.push(Decoration.inline(from, to, {
            style: `background-color: ${c.color}40;` 
          }));
        }
        
        const widget = document.createElement('span');
        widget.className = 'remote-cursor';
        widget.style.borderLeftColor = c.color;
        
        const flag = document.createElement('span');
        flag.className = 'remote-cursor-flag';
        flag.style.backgroundColor = c.color;
        flag.innerText = c.name;
        
        widget.appendChild(flag);
        decos.push(Decoration.widget(safeHead, widget, { side: 1 }));
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
  
  // Use useDocHandle which correctly manages the async handle lifecycle
  const handle = useDocHandle<{ text: string }>(docUrl);
  const [loaded, setLoaded] = useState(false);

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
        cursorPlugin()
      ]
    });

    const view = new EditorView(editorRoot.current, { 
      state,
      dispatchTransaction(transaction) {
        const newState = view.state.apply(transaction);
        view.updateState(newState);
        onStateChange(newState);

        if (transaction.selectionSet) {
          handle.broadcast({
            type: 'cursor',
            clientId: myClientId,
            head: newState.selection.head, 
            anchor: newState.selection.anchor, 
            name: myName,
            color: myColor
          });
        }
      }
    });

    const onMessage = (msg: any) => {
      const data = msg.message; 
      if (data && data.type === 'cursor' && data.clientId !== myClientId) {
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


export default function App({ rootDocUrl }: { rootDocUrl: AutomergeUrl }) {
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  
  const [hash, setHash] = useHash();
  const cleanHash = hash.slice(1);
  const selectedDocUrl = cleanHash && isValidAutomergeUrl(cleanHash) 
    ? (cleanHash as AutomergeUrl) 
    : null;

  const [doc, changeDoc] = useDocument<{ title?: string, text: string }>(selectedDocUrl || "" as AutomergeUrl);
  const title = doc?.title || "Untitled document";

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedDocUrl) changeDoc((d) => { d.title = e.target.value; });
  };

  return (
    <div className="app-container">
      <Header 
        title={title} 
        onTitleChange={handleTitleChange} 
        onToggleChat={() => setChatOpen(!chatOpen)} 
        chatOpen={chatOpen}
      />
      <Toolbar view={editorView} editorState={editorState} />
      <main className="main-workspace">
        <Sidebar 
          rootDocUrl={rootDocUrl} 
          selectedDocUrl={selectedDocUrl} 
          onSelect={(url) => setHash(url)} 
        />
        <section className="editor-container">
          <div className="document-page">
            {selectedDocUrl ? (
              <ProseMirrorEditor 
                key={selectedDocUrl} 
                docUrl={selectedDocUrl} 
                onViewCreated={setEditorView}
                onStateChange={setEditorState}
              />
            ) : (
              <div className="text-muted" style={{ textAlign: 'center', marginTop: '100px' }}>
                Select or create a document to begin editing.
              </div>
            )}
          </div>
        </section>
        {/* Render chat drawer if a document is selected and chat is toggled open */}
        {selectedDocUrl && chatOpen && <ChatDrawer docUrl={selectedDocUrl} />}
      </main>
    </div>
  );
}