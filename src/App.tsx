import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Star, Share, Search, 
  Undo, Redo, Printer, Bold, Italic, Underline, 
  AlignLeft, AlignCenter, AlignRight, FileText, HelpCircle, History
} from 'lucide-react';

// ProseMirror Imports
import { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark, setBlockType } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';

// Automerge Repo Imports
import * as A from "@automerge/automerge";
import { AutomergeUrl, isValidAutomergeUrl } from "@automerge/automerge-repo";
import { useRepo, useDocument, useDocHandle } from "@automerge/automerge-repo-react-hooks";
import { init } from "@automerge/prosemirror";
import { useHash } from "react-use";
import { RootDocument } from "./rootDoc";
import { goOffline, goOnline } from './main';

import './App.css';

const HistoryDrawer = ({ 
  docUrl, 
  onClose,
  selectedVersion,
  onSelectVersion
}: { 
  docUrl: AutomergeUrl; 
  onClose: () => void;
  selectedVersion: string | null;
  onSelectVersion: (hash: string) => void;
}) => {
  const [doc] = useDocument(docUrl);

  const history = useMemo(() => {
    if (!doc) return [];
    try {
      const changes = A.getAllChanges(doc);
      
      // We will group changes that happen within 2 minutes of each other
      const GROUPING_WINDOW_MS = 120000; 
      const grouped = [];
      let currentGroup: any = null;

      changes.forEach((changeBytes) => {
        const decoded = A.decodeChange(changeBytes);
        const changeTime = decoded.time;
        const author = `User ${decoded.actor.substring(0, 5)}`;

        if (!currentGroup) {
          currentGroup = { id: decoded.hash, time: changeTime, author, count: 1 };
        } else {
          // If the same author typed again within the time window, cluster it!
          if (currentGroup.author === author && (changeTime - currentGroup.time < GROUPING_WINDOW_MS)) {
            currentGroup.id = decoded.hash; // Track the latest state of this burst
            currentGroup.time = changeTime; // Update to the latest timestamp
            currentGroup.count += 1;
          } else {
            // Time window closed or new author. Push the old group and start a new one.
            grouped.push(currentGroup);
            currentGroup = { id: decoded.hash, time: changeTime, author, count: 1 };
          }
        }
      });

      if (currentGroup) grouped.push(currentGroup);

      // Reverse it so newest clusters are at the top, and format the output
      return grouped.reverse().map((item, idx) => ({
        ...item,
        displayTime: new Date(item.time).toLocaleString([], { 
          month: 'short', day: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
        }),
        // Add a nice message showing how many keystrokes/changes were clustered
        message: idx === grouped.length - 1 
          ? "Created document" 
          : (item.count > 1 ? `Made ${item.count} edits` : "Edited document")
      }));

    } catch (e) {
      console.error("Failed to decode history", e);
      return [];
    }
  }, [doc]);

  return (
    <aside className="docs-sidebar" style={{ borderLeft: '1px solid var(--border-color)', width: '300px', display: 'flex', flexDirection: 'column' }}>
      <div className="sidebar-header" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
        <span className="font-semibold" style={{ fontSize: '14px' }}>Version History</span>
        <button onClick={onClose} className="icon-btn" style={{ fontSize: '12px' }}>✕</button>
      </div>
      <div className="sidebar-content" style={{ padding: '8px', overflowY: 'auto', flex: 1 }}>
        {history.length === 0 ? (
          <div className="text-muted text-sm" style={{ padding: '16px', textAlign: 'center' }}>No history found.</div>
        ) : (
          history.map(item => (
            <div 
              key={item.id} 
              onClick={() => onSelectVersion(item.id)}
              style={{ 
                padding: '12px', 
                borderBottom: '1px solid var(--border-color)', 
                cursor: 'pointer', 
                transition: 'background 0.2s',
                backgroundColor: selectedVersion === item.id ? 'var(--active-bg)' : 'transparent'
              }} 
            >
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-color)' }}>{item.displayTime}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span className="text-muted text-sm">{item.author}</span>
                <span className="text-muted text-sm" style={{ fontStyle: 'italic', fontSize: '11px' }}>{item.message}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};

const PresenceBar = ({ docUrl }: { docUrl: AutomergeUrl }) => {
  const handle = useDocHandle(docUrl);
  const [peerStatuses, setPeerStatuses] = useState<Record<string, boolean>>({});
  const [isOnline, setIsOnline] = useState(true);

  // Generate a stable client ID for this session
  const myClientId = useRef(Math.random().toString(36).substr(2, 9)).current;

  useEffect(() => {
    if (!handle) return;

    const onMessage = (msg: any) => {
      const data = msg.message;
      // Listen for presence broadcast packets
      if (data && data.type === 'presence' && data.clientId !== myClientId) {
        setPeerStatuses(prev => ({
          ...prev,
          [data.clientId]: data.isOnline
        }));
      }
    };

    handle.on("ephemeral-message", onMessage);
    return () => {
      handle.off("ephemeral-message", onMessage);
    };
  }, [handle, myClientId]);

  const toggleConnection = () => {
    const nextState = !isOnline;
    if (nextState) {
      goOnline();
    } else {
      goOffline();
    }
    setIsOnline(nextState);

    // Broadcast our new connection state to all peers
    if (handle) {
      handle.broadcast({
        type: 'presence',
        clientId: myClientId,
        isOnline: nextState
      });
    }
  };

  return (
    <div className="presence-bar" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px', paddingRight: '8px', borderRight: '1px solid var(--border-color)', marginRight: '8px' }}>
      
      <button 
        className={`status-badge ${isOnline ? 'online' : 'offline'}`} 
        onClick={toggleConnection}
        title="Click to toggle Online/Offline"
        style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '4px 10px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'white' }}
      >
        <span 
          className="status-dot" 
          style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isOnline ? '#34a853' : '#ea4335' }} 
        />
        <span style={{ fontSize: '12px', fontWeight: 600 }}>
          {isOnline ? "Online" : "Offline"}
        </span>
      </button>

      <div className="friend-avatars" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span className="text-muted text-sm" style={{ fontSize: '12px' }}>Active:</span>
        <div className="avatar-cluster" style={{ display: 'flex', alignItems: 'center' }}>
          
          {/* Local User Avatar */}
          <div 
            className={`avatar ${!isOnline ? 'offline-avatar' : ''}`} 
            title="You (Local)" 
            style={{ fontSize: '10px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: '#9c27b0', color: 'white', border: '2px solid white', zIndex: 10 }}
          >
            Me
          </div>

          {/* Remote Peer Avatars with status styling */}
          {Object.entries(peerStatuses).map(([clientId, online], idx) => (
            <div 
              key={clientId} 
              className={`avatar remote ${!online ? 'offline-avatar' : ''}`} 
              title={`Peer: ${clientId} (${online ? 'Online' : 'Offline'})`} 
              style={{ fontSize: '10px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: '#fbbc04', color: '#202124', border: '2px solid white', marginLeft: '-6px', zIndex: 9 - idx }}
            >
              {String.fromCharCode(65 + (idx % 26))}
            </div>
          ))}
        </div>
      </div>
      
    </div>
  );
};

const Header = ({ 
  title, 
  onTitleChange, 
  selectedDocUrl,
  historyOpen,
  onToggleHistory
}: { 
  title: string; 
  onTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedDocUrl: AutomergeUrl | null;
  historyOpen: boolean;
  onToggleHistory: () => void;
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
        {selectedDocUrl && <PresenceBar docUrl={selectedDocUrl} />}
        
        {/* NEW: History Toggle Button */}
        <button 
          className={`icon-btn ${historyOpen ? 'active' : ''}`} 
          onClick={onToggleHistory} 
          title="Open Version History"
        >
          <History size={18} />
        </button>

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

  const insertQuestionBlock = () => {
    if (!view || !activeSchema) return;
    const question = window.prompt("Enter the question you want to lock:");
    if (!question) return;

    const { state, dispatch } = view;
    
    // 1. Create the text and paragraph for the question
    const textNode = activeSchema.text("Q: " + question);
    const paragraphNode = activeSchema.nodes.paragraph.create(null, textNode);
    const questionNode = activeSchema.nodes.blockquote.create(null, paragraphNode);
    
    // 2. Create an empty paragraph to go below it
    const emptyParagraph = activeSchema.nodes.paragraph.create();
    
    // 3. Insert BOTH the locked question and the empty paragraph at the cursor
    if (questionNode && emptyParagraph) {
      const tr = state.tr.insert(state.selection.head, [questionNode, emptyParagraph]);
      dispatch(tr);
      view.focus();
    }
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
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button 
          className="icon-btn" 
          onClick={insertQuestionBlock} 
          title="Insert Locked Question"
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 8px', width: 'auto' }}
        >
          <HelpCircle size={16} /> Insert Question
        </button>
      </div>
    </div>
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
    const newDoc = repo.create({ text: "", title: "Untitled document" });
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
  const handle = useDocHandle<{ text: string }>(docUrl);
  const [loaded, setLoaded] = useState(false);

  const myClientId = useRef(Math.random().toString(36).substr(2, 9)).current;
  const myColor = useRef(['#ff5722', '#4caf50', '#2196f3', '#e91e63', '#9c27b0'][Math.floor(Math.random() * 5)]).current;
  const myName = useRef(`User ${Math.floor(Math.random() * 1000)}`).current;

  // Safe promise handling block
  useEffect(() => {
    if (!handle) return;
    handle.whenReady().then(() => {
      setLoaded(true);
    });
  }, [handle]);

  useEffect(() => {
    if (!editorRoot.current || !loaded || !handle) return;
    const { pmDoc, schema, plugin } = init(handle, ["text"]);

    // Locked Question Plugin
    const lockedQuestionPlugin = new Plugin({
      key: new PluginKey('lockedQuestion'),
      props: {
        decorations(state) {
          const decos: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'blockquote') {
              decos.push(Decoration.node(pos, pos + node.nodeSize, {
                contenteditable: 'false',
                class: 'locked-question-block'
              }));
            }
          });
          return DecorationSet.create(state.doc, decos);
        }
      }
    });

    const state = EditorState.create({
      schema,
      doc: pmDoc,
      plugins: [
        history(),
        keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo }),
        keymap(baseKeymap),
        plugin,
        cursorPlugin(),
        lockedQuestionPlugin // Injected here
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
  const [historyOpen, setHistoryOpen] = useState(false);
  
  // --- Time Travel States ---
  const [timeTravelUrl, setTimeTravelUrl] = useState<AutomergeUrl | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  
  const repo = useRepo();
  const [hash, setHash] = useHash();
  const cleanHash = hash.slice(1);
  const selectedDocUrl = cleanHash && isValidAutomergeUrl(cleanHash) 
    ? (cleanHash as AutomergeUrl) 
    : null;

  // We need direct access to the handle to view historical states
  const handle = useDocHandle(selectedDocUrl ?? undefined);
  const [doc, changeDoc] = useDocument<{ title?: string, text: string }>(selectedDocUrl || "" as AutomergeUrl);
  
  const title = doc?.title || "Untitled document";

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedDocUrl && !selectedVersion) changeDoc((d) => { d.title = e.target.value; });
  };

  // --- The Time Machine Logic ---
  // --- The Time Machine Logic ---
  const handleTimeTravel = (versionHash: string) => {
    const currentDoc = handle?.docSync();
    if (!currentDoc) return;

    try {
      // 1. Ask Automerge to rewind the document to this exact moment
      const oldDoc = A.view(currentDoc, [versionHash]);
      
      // 2. Create a blank temporary document in the repo
      const tempHandle = repo.create();
      
      // 3. Safely inject the cloned historical state (preserves all formatting!)
      tempHandle.update(() => A.clone(oldDoc));
      
      // 4. Point our editor to the temporary document
      setTimeTravelUrl(tempHandle.url);
      setSelectedVersion(versionHash);
    } catch (e) {
      console.error("Failed to travel back in time:", e);
    }
  };

  const exitTimeTravel = () => {
    setTimeTravelUrl(null);
    setSelectedVersion(null);
  };

  return (
    <div className="app-container">
      <Header 
        title={title} 
        onTitleChange={handleTitleChange} 
        selectedDocUrl={selectedDocUrl}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen(!historyOpen)}
      />
      <Toolbar view={editorView} editorState={editorState} />
      
      <main className="main-workspace" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar 
          rootDocUrl={rootDocUrl} 
          selectedDocUrl={selectedDocUrl} 
          onSelect={(url) => { setHash(url); exitTimeTravel(); }} 
        />
        
        {/* NEW: Wrapper to stack the banner and editor vertically */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          
          {/* Time Travel Warning Banner */}
          {selectedVersion && (
            <div style={{ backgroundColor: '#fef7e0', padding: '12px 24px', borderBottom: '1px solid #f2c75c', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ color: '#b06000', fontWeight: 600, fontSize: '14px' }}>
                Viewing a historical version of this document.
              </span>
              <button 
                onClick={exitTimeTravel} 
                style={{ background: '#b06000', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
              >
                Return to Current
              </button>
            </div>
          )}

          {/* The original editor container takes the remaining height */}
          <section className="editor-container" style={{ flex: 1, overflowY: 'auto' }}>
            <div className="document-page">
              {selectedDocUrl ? (
                <div style={selectedVersion ? { pointerEvents: 'none', opacity: 0.7, filter: 'grayscale(20%)' } : {}}>
                  <ProseMirrorEditor 
                    key={timeTravelUrl || selectedDocUrl} 
                    docUrl={timeTravelUrl || selectedDocUrl} 
                    onViewCreated={setEditorView}
                    onStateChange={setEditorState}
                  />
                </div>
              ) : (
                <div className="text-muted" style={{ textAlign: 'center', marginTop: '100px' }}>
                  Select or create a document to begin editing.
                </div>
              )}
            </div>
          </section>
        </div>
        
        {/* Version History Sidebar */}
        {selectedDocUrl && historyOpen && (
          <HistoryDrawer 
            docUrl={selectedDocUrl} 
            onClose={() => setHistoryOpen(false)} 
            selectedVersion={selectedVersion}
            onSelectVersion={handleTimeTravel}
          />
        )}
      </main>
    </div>
  );
}