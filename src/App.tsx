import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Star, Share, Search, 
  Undo, Redo, Printer, Bold, Italic, Underline, 
  AlignLeft, AlignCenter, AlignRight, FileText, HelpCircle,
  History, MessageSquare, Trash2
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

// --- Shared Identity Interface ---
interface UserIdentity {
  clientId: string;
  color: string;
  name: string;
}

const PresenceBar = ({ docUrl, clientId }: { docUrl: AutomergeUrl, clientId: string }) => {
  const handle = useDocHandle(docUrl);
  const [peerStatuses, setPeerStatuses] = useState<Record<string, boolean>>({});
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (!handle) return;

    const onMessage = (msg: any) => {
      const data = msg.message;
      if (data && data.type === 'presence' && data.clientId !== clientId) {
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
  }, [handle, clientId]);

  const toggleConnection = () => {
    const nextState = !isOnline;
    if (nextState) goOnline();
    else goOffline();
    
    setIsOnline(nextState);

    if (handle) {
      handle.broadcast({
        type: 'presence',
        clientId: clientId,
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
          <div 
            className={`avatar ${!isOnline ? 'offline-avatar' : ''}`} 
            title="You (Local)" 
            style={{ fontSize: '10px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: '#9c27b0', color: 'white', border: '2px solid white', zIndex: 10 }}
          >
            Me
          </div>
          {Object.entries(peerStatuses).map(([id, online], idx) => (
            <div 
              key={id} 
              className={`avatar remote ${!online ? 'offline-avatar' : ''}`} 
              title={`Peer: ${id} (${online ? 'Online' : 'Offline'})`} 
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
  onToggleHistory,
  chatOpen,
  onToggleChat,
  identity,
  lobbyOpen,
  onToggleLobby,
}: { 
  title: string; 
  onTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedDocUrl: AutomergeUrl | null;
  historyOpen: boolean;
  onToggleHistory: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  identity: UserIdentity;
  lobbyOpen: boolean; // <-- ADDED
  onToggleLobby: () => void;
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
        {selectedDocUrl && <PresenceBar docUrl={selectedDocUrl} clientId={identity.clientId} />}
        <button 
          className={`share-btn ${lobbyOpen ? 'active' : ''}`} 
          onClick={onToggleLobby} 
          style={{ background: '#34a853' }}
        >
          Lobby
        </button>
        <button 
          className={`icon-btn ${chatOpen ? 'active' : ''}`} 
          onClick={onToggleChat} 
          title="Open Chat"
        >
          <MessageSquare size={18} />
        </button>

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
        <div className="avatar" style={{ backgroundColor: identity.color }}>
          {identity.name.charAt(0)}
        </div>
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
  const [promptOpen, setPromptOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");

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

  const handleInsertQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    setPromptOpen(false);
    
    if (!view || !activeSchema || !questionText.trim()) return;

    const { state, dispatch } = view;
    const textNode = activeSchema.text("Q: " + questionText.trim());
    const paragraphNode = activeSchema.nodes.paragraph.create(null, textNode);
    const questionNode = activeSchema.nodes.blockquote.create(null, paragraphNode);
    const emptyParagraph = activeSchema.nodes.paragraph.create();
    
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
    <>
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
            onClick={() => { setQuestionText(""); setPromptOpen(true); }} 
            title="Insert Locked Question"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 8px', width: 'auto' }}
          >
            <HelpCircle size={16} /> Insert Question
          </button>
        </div>
      </div>

      {promptOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form 
            onSubmit={handleInsertQuestion} 
            style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '16px', width: '300px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
          >
            <label style={{ fontWeight: 600, fontSize: '14px', color: '#202124' }}>Enter the question you want to lock:</label>
            <input 
              type="text" autoFocus value={questionText} 
              onChange={e => setQuestionText(e.target.value)} 
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #dadce0', fontSize: '14px', outline: 'none' }} 
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setPromptOpen(false)} style={{ padding: '6px 12px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#5f6368', fontWeight: 600 }}>Cancel</button>
              <button type="submit" style={{ padding: '6px 12px', border: 'none', background: '#1a73e8', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Insert</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

const LobbyDrawer = ({ identity, onClose }: { identity: UserIdentity, onClose: () => void }) => {
  const [activePeers, setActivePeers] = useState<Record<string, UserIdentity>>({});

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3031');
    
    ws.onopen = () => {
      // Announce our identity to the public swarm
      ws.send(JSON.stringify({ type: 'lobby-presence', identity }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // If someone new announces themselves, save them and echo back our identity
        if (data.type === 'lobby-presence' && data.identity.clientId !== identity.clientId) {
          setActivePeers(prev => ({ ...prev, [data.identity.clientId]: data.identity }));
          ws.send(JSON.stringify({ type: 'lobby-presence-reply', identity }));
        }
        
        // If someone replies to our announcement, save them
        if (data.type === 'lobby-presence-reply' && data.identity.clientId !== identity.clientId) {
          setActivePeers(prev => ({ ...prev, [data.identity.clientId]: data.identity }));
        }
      } catch (e) {
        // Ignore non-JSON or Automerge sync messages for now
      }
    };

    return () => ws.close();
  }, [identity]);

  return (
    <aside className="docs-sidebar" style={{ borderLeft: '1px solid var(--border-color)', width: '300px', backgroundColor: '#f9fbfd' }}>
      <div className="sidebar-header" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid var(--border-color)' }}>
        <span className="font-semibold" style={{ fontSize: '14px' }}>Public Lobby</span>
        <button onClick={onClose} className="icon-btn" style={{ fontSize: '12px' }}>✕</button>
      </div>
      <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
        <p style={{ fontSize: '12px', color: '#5f6368', marginBottom: '16px' }}>Discovering peers on Hyperswarm...</p>
        
        {Object.values(activePeers).map(peer => (
          <div key={peer.clientId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: 'white', borderRadius: '8px', marginBottom: '8px', border: '1px solid #dadce0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: peer.color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                {peer.name.charAt(0)}
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>{peer.name}</span>
            </div>
            <button style={{ padding: '6px 12px', backgroundColor: '#1a73e8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
              Invite
            </button>
          </div>
        ))}
        {Object.keys(activePeers).length === 0 && (
          <div style={{ textAlign: 'center', color: '#80868b', fontSize: '13px', marginTop: '24px' }}>No one else is here yet.</div>
        )}
      </div>
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
  onSelect: (url: string) => void 
}) => {
  const repo = useRepo();
  const [rootDoc, changeRootDoc] = useDocument<RootDocument>(rootDocUrl);
  const documents = rootDoc?.documents || [];
  
  // NEW: State to control the visibility and target of our custom modal
  const [docToDelete, setDocToDelete] = useState<AutomergeUrl | null>(null);

  useEffect(() => {
    if (selectedDocUrl) {
      changeRootDoc((d) => {
        if (!d.documents) d.documents = [];
        if (!d.documents.includes(selectedDocUrl)) d.documents.push(selectedDocUrl);
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

  // 1. Opens the modal instead of firing window.confirm
  const handleDeleteClick = (e: React.MouseEvent, url: AutomergeUrl) => {
    e.stopPropagation();
    setDocToDelete(url);
  };

  // 2. Executes the actual deletion when "Delete" is clicked in the modal
  const confirmDelete = () => {
    if (!docToDelete) return;
    
    changeRootDoc(d => {
      if (d.documents) {
        const index = d.documents.indexOf(docToDelete);
        if (index > -1) {
          d.documents.splice(index, 1);
        }
      }
    });
    
    if (selectedDocUrl === docToDelete) {
      onSelect(""); 
    }
    
    setDocToDelete(null); // Close the modal
  };

  return (
    <>
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
                onClick={() => onSelect(url as string)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '8px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <span>📄</span>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <DocumentTitle docUrl={url as AutomergeUrl} />
                  </div>
                </div>
                
                <button
                  onClick={(e) => handleDeleteClick(e, url as AutomergeUrl)}
                  title="Delete Document"
                  style={{ 
                    background: 'transparent', 
                    border: 'none', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    opacity: 0.5,
                    padding: '4px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                >
                  <Trash2 size={14} color="#ea4335" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* NEW: Custom Delete Confirmation Modal */}
      {docToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '16px', width: '300px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <label style={{ fontWeight: 600, fontSize: '14px', color: '#202124' }}>
              Are you sure you want to delete this document?
            </label>
            <div style={{ fontSize: '13px', color: '#5f6368', marginTop: '-8px' }}>
              This action will remove it from your list.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button 
                onClick={() => setDocToDelete(null)} 
                style={{ padding: '6px 12px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#5f6368', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete} 
                style={{ padding: '6px 12px', border: 'none', background: '#ea4335', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// --- Custom Drawers (History & Chat) ---
const HistoryDrawer = ({ docUrl, onClose, selectedVersion, onSelectVersion }: { docUrl: AutomergeUrl; onClose: () => void; selectedVersion: string | null; onSelectVersion: (hash: string) => void; }) => {
  const [doc] = useDocument(docUrl);
  const history = useMemo(() => {
    if (!doc) return [];
    try {
      const changes = A.getAllChanges(doc);
      const GROUPING_WINDOW_MS = 120000; 
      const grouped: any[] = [];
      let currentGroup: any = null;

      changes.forEach((changeBytes) => {
        const decoded = A.decodeChange(changeBytes);
        const changeTime = decoded.time;
        const author = `User ${decoded.actor.substring(0, 5)}`;

        if (!currentGroup) {
          currentGroup = { id: decoded.hash, time: changeTime, author, count: 1 };
        } else {
          if (currentGroup.author === author && (changeTime - currentGroup.time < GROUPING_WINDOW_MS)) {
            currentGroup.id = decoded.hash; 
            currentGroup.time = changeTime; 
            currentGroup.count += 1;
          } else {
            grouped.push(currentGroup);
            currentGroup = { id: decoded.hash, time: changeTime, author, count: 1 };
          }
        }
      });
      if (currentGroup) grouped.push(currentGroup);

      return grouped.reverse().map((item, idx) => ({
        ...item,
        displayTime: new Date(item.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        message: idx === grouped.length - 1 ? "Created document" : (item.count > 1 ? `Made ${item.count} edits` : "Edited document")
      }));
    } catch (e) {
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
                padding: '12px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background 0.2s',
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

const ChatDrawer = ({ docUrl, onClose, identity }: { docUrl: AutomergeUrl, onClose: () => void, identity: UserIdentity }) => {
  const [doc, changeDoc] = useDocument<any>(docUrl);
  const [msg, setMsg] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [doc?.chat]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msg.trim()) return;

    changeDoc((d: any) => {
      if (!d.chat) d.chat = [];
      d.chat.push({
        id: Math.random().toString(36).substr(2, 9),
        senderId: identity.clientId,
        senderName: identity.name,
        color: identity.color,
        text: msg,
        time: Date.now()
      });
    });
    setMsg("");
  };

  return (
    <aside className="docs-sidebar" style={{ borderLeft: '1px solid var(--border-color)', width: '300px', display: 'flex', flexDirection: 'column', backgroundColor: '#f9fbfd' }}>
      <div className="sidebar-header" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', backgroundColor: 'white' }}>
        <span className="font-semibold" style={{ fontSize: '14px' }}>Team Chat</span>
        <button onClick={onClose} className="icon-btn" style={{ fontSize: '12px' }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {doc?.chat?.length ? doc.chat.map((c: any) => {
          const isMe = c.senderId === identity.clientId;
          return (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
              <span style={{ fontSize: '10px', color: 'gray', marginBottom: '2px', marginLeft: '4px', marginRight: '4px' }}>
                {c.senderName}
              </span>
              <div style={{
                backgroundColor: isMe ? '#1a73e8' : 'white',
                color: isMe ? 'white' : '#202124',
                padding: '8px 12px',
                borderRadius: '16px',
                borderBottomRightRadius: isMe ? '4px' : '16px',
                borderBottomLeftRadius: isMe ? '16px' : '4px',
                fontSize: '13px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                maxWidth: '90%',
                wordBreak: 'break-word'
              }}>
                {c.text}
              </div>
            </div>
          );
        }) : (
          <div className="text-muted text-sm" style={{ textAlign: 'center', marginTop: '20px' }}>No messages yet. Say hi!</div>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSend} style={{ padding: '16px', backgroundColor: 'white', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
        <input
          type="text" value={msg} onChange={e => setMsg(e.target.value)} placeholder="Type a message..."
          style={{ flex: 1, padding: '8px 12px', borderRadius: '20px', border: '1px solid #dadce0', fontSize: '13px', outline: 'none' }}
        />
        <button type="submit" style={{ padding: '8px 16px', backgroundColor: '#1a73e8', color: 'white', border: 'none', borderRadius: '20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          Send
        </button>
      </form>
    </aside>
  );
};

// --- ProseMirror Plugins ---
const cursorPluginKey = new PluginKey('cursors');
const cursorPlugin = () => new Plugin({
  key: cursorPluginKey,
  state: {
    init() { return { cursors: {} }; },
    apply(tr, pluginState) {
      const meta = tr.getMeta(cursorPluginKey);
      let { cursors } = pluginState;
      if (meta) cursors = { ...cursors, [meta.clientId]: meta };
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
          decos.push(Decoration.inline(from, to, { style: `background-color: ${c.color}40;` }));
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

const diffPluginKey = new PluginKey('diffHighlight');
const diffPlugin = (initialRanges: any[]) => new Plugin({
  key: diffPluginKey,
  state: {
    init: (_config, state) => {
      if (!initialRanges || initialRanges.length === 0) return DecorationSet.empty;
      const decos: Decoration[] = [];
      const docSize = state.doc.content.size;
      initialRanges.forEach((r: any) => {
        const safeStart = Math.max(1, Math.min(r.start, docSize - 1));
        const safeEnd = Math.max(safeStart + 1, Math.min(r.end, docSize - 1));
        if (safeStart < safeEnd) {
          decos.push(Decoration.inline(safeStart, safeEnd, { class: 'author-highlight', style: `--author-color: ${r.color}` }));
        }
      });
      return DecorationSet.create(state.doc, decos);
    },
    apply: (tr, oldSet) => {
      const diffData = tr.getMeta(diffPluginKey);
      if (diffData) {
        const decos: Decoration[] = [];
        const docSize = tr.doc.content.size;
        diffData.ranges.forEach((r: any) => {
          const safeStart = Math.max(1, Math.min(r.start, docSize - 1));
          const safeEnd = Math.max(safeStart + 1, Math.min(r.end, docSize - 1));
          if (safeStart < safeEnd) {
            decos.push(Decoration.inline(safeStart, safeEnd, { class: 'author-highlight', style: `--author-color: ${r.color}` }));
          }
        });
        return DecorationSet.create(tr.doc, decos);
      }
      return oldSet.map(tr.mapping, tr.doc);
    }
  },
  props: { decorations(state) { return diffPluginKey.getState(state); } }
});

const ProseMirrorEditor = ({ 
  docUrl, onViewCreated, onStateChange, highlightRanges = [], identity
}: { 
  docUrl: AutomergeUrl; onViewCreated: (view: EditorView | null) => void; onStateChange: (state: EditorState) => void; highlightRanges?: { start: number, end: number, color: string }[]; identity: UserIdentity;
}) => {
  const editorRoot = useRef<HTMLDivElement>(null);
  const handle = useDocHandle<{ text: string }>(docUrl);
  const [loaded, setLoaded] = useState(false);
  
  const { clientId: myClientId, color: myColor, name: myName } = identity;

  useEffect(() => {
    if (!handle) return;
    handle.whenReady().then(() => setLoaded(true));
  }, [handle]);

  useEffect(() => {
    if (!editorRoot.current || !loaded || !handle) return;
    const { pmDoc, schema, plugin } = init(handle, ["text"]);

    const lockedQuestionPlugin = new Plugin({
      key: new PluginKey('lockedQuestion'),
      props: {
        decorations(state) {
          const decos: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'blockquote') {
              decos.push(Decoration.node(pos, pos + node.nodeSize, { contenteditable: 'false', class: 'locked-question-block' }));
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
        lockedQuestionPlugin,
        diffPlugin(highlightRanges) 
      ]
    });

    const view = new EditorView(editorRoot.current, { 
      state,
      dispatchTransaction(transaction) {
        const newState = view.state.apply(transaction);
        view.updateState(newState);
        onStateChange(newState);

        if (transaction.selectionSet) {
          handle.broadcast({ type: 'cursor', clientId: myClientId, head: newState.selection.head, anchor: newState.selection.anchor, name: myName, color: myColor });
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

// --- Diffing Utilities ---
const getRawText = (obj: any): string => {
  if (!obj) return "";
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(getRawText).join('');
  if (obj.type === 'text') return obj.text || "";
  if (obj.content) return getRawText(obj.content);
  return " "; 
};

const computeSimpleDiff = (oldStr: string, newStr: string, color: string) => {
  if (!oldStr) oldStr = "";
  if (!newStr) newStr = "";
  let start = 0;
  while (start < oldStr.length && start < newStr.length && oldStr[start] === newStr[start]) start++;
  let oldEnd = oldStr.length - 1;
  let newEnd = newStr.length - 1;
  while (oldEnd >= start && newEnd >= start && oldStr[oldEnd] === newStr[newEnd]) {
    oldEnd--;
    newEnd--;
  }
  if (newEnd >= start) return [{ start: Math.max(1, start), end: newEnd + 3, color }];
  return [];
};


// --- Main Application ---
export default function App({ rootDocUrl }: { rootDocUrl: AutomergeUrl }) {
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  
  // Create ONE unified identity for Chat, Cursors, and Presence
  const myIdentity = useRef({
    clientId: Math.random().toString(36).substr(2, 9),
    color: ['#ff5722', '#4caf50', '#2196f3', '#e91e63', '#9c27b0'][Math.floor(Math.random() * 5)],
    name: `User ${Math.floor(Math.random() * 1000)}`
  }).current;

  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  
  const [timeTravelUrl, setTimeTravelUrl] = useState<AutomergeUrl | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [diffRanges, setDiffRanges] = useState<{ start: number, end: number, color: string }[]>([]);
  
  const repo = useRepo();
  const [hash, setHash] = useHash();
  const cleanHash = hash.slice(1);
  const selectedDocUrl = cleanHash && isValidAutomergeUrl(cleanHash) ? (cleanHash as AutomergeUrl) : null;
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const handle = useDocHandle(selectedDocUrl ?? undefined);
  const [doc, changeDoc] = useDocument<{ title?: string, text: string, chat?: any[] }>(selectedDocUrl || "" as AutomergeUrl);
  
  const title = doc?.title || "Untitled document";

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedDocUrl && !selectedVersion) changeDoc((d) => { d.title = e.target.value; });
  };

  const toggleHistory = () => {
    setHistoryOpen(!historyOpen);
    if (!historyOpen) { setChatOpen(false); setLobbyOpen(false); }
  };

  const toggleChat = () => {
    setChatOpen(!chatOpen);
    if (!chatOpen) { setHistoryOpen(false); setLobbyOpen(false); }
  };

  const toggleLobby = () => {
    setLobbyOpen(!lobbyOpen);
    if (!lobbyOpen) { setHistoryOpen(false); setChatOpen(false); }
  };


  const handleTimeTravel = (versionHash: string) => {
    const currentDoc = handle?.docSync();
    if (!currentDoc) return;

    try {
      const targetDoc = A.view(currentDoc, [versionHash]);
      const historyHeads = A.getHistory(currentDoc);
      
      const currentIndex = historyHeads.findIndex(h => h.change.hash === versionHash);
      const previousHash = currentIndex > 0 ? historyHeads[currentIndex - 1].change.hash : null;
      const prevDoc = previousHash ? A.view(currentDoc, [previousHash]) : null;

      const newTextObj = (targetDoc as any).text;
      const oldTextObj = prevDoc ? (prevDoc as any).text : "";
      const newText = newTextObj ? newTextObj.toString() : "";
      const oldText = oldTextObj ? oldTextObj.toString() : "";
      
      const ranges = computeSimpleDiff(oldText, newText, "#9c27b0"); 
      
      const tempHandle = repo.create();
      tempHandle.update(() => A.clone(targetDoc));
      
      setTimeTravelUrl(tempHandle.url);
      setSelectedVersion(versionHash);
      setDiffRanges(ranges);
    } catch (e) {
      console.error("Failed to travel back in time:", e);
    }
  };

  const exitTimeTravel = () => {
    setTimeTravelUrl(null);
    setSelectedVersion(null);
    setDiffRanges([]); 
  };

  return (
    <div className="app-container">
      <Header 
        title={title} 
        onTitleChange={handleTitleChange} 
        selectedDocUrl={selectedDocUrl}
        historyOpen={historyOpen}
        onToggleHistory={toggleHistory}
        chatOpen={chatOpen}
        onToggleChat={toggleChat}
        identity={myIdentity}
        lobbyOpen={lobbyOpen}     
        onToggleLobby={toggleLobby}
      />
      <Toolbar view={editorView} editorState={editorState} />
      
      <main className="main-workspace" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar 
          rootDocUrl={rootDocUrl} 
          selectedDocUrl={selectedDocUrl} 
          onSelect={(url) => { setHash(url); exitTimeTravel(); }} 
        />
        
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {selectedVersion && (
            <div style={{ backgroundColor: '#fef7e0', padding: '12px 24px', borderBottom: '1px solid #f2c75c', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ color: '#b06000', fontWeight: 600, fontSize: '14px' }}>Viewing a historical version of this document.</span>
              <button onClick={exitTimeTravel} style={{ background: '#b06000', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>Return to Current</button>
            </div>
          )}

          <section className="editor-container" style={{ flex: 1, overflowY: 'auto' }}>
            <div className="document-page">
              {selectedDocUrl ? (
                <div style={selectedVersion ? { pointerEvents: 'none', opacity: 0.7, filter: 'grayscale(20%)' } : {}}>
                  <ProseMirrorEditor 
                    key={timeTravelUrl || selectedDocUrl} 
                    docUrl={timeTravelUrl || selectedDocUrl} 
                    onViewCreated={setEditorView}
                    onStateChange={setEditorState}
                    highlightRanges={diffRanges}
                    identity={myIdentity}
                  />
                </div>
              ) : (
                <div className="text-muted" style={{ textAlign: 'center', marginTop: '100px' }}>Select or create a document to begin editing.</div>
              )}
            </div>
          </section>
        </div>
        
        {/* Render mutually exclusive drawers */}
        {selectedDocUrl && historyOpen && (
          <HistoryDrawer docUrl={selectedDocUrl} onClose={() => setHistoryOpen(false)} selectedVersion={selectedVersion} onSelectVersion={handleTimeTravel} />
        )}
        
        {selectedDocUrl && chatOpen && (
          <ChatDrawer docUrl={selectedDocUrl} onClose={() => setChatOpen(false)} identity={myIdentity} />
        )}
        {lobbyOpen && (
          <LobbyDrawer identity={myIdentity} onClose={() => setLobbyOpen(false)} />
        )}
      </main>
    </div>
  );
}