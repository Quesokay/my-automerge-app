import { useState, useEffect, useRef } from 'react';
import { 
  Star, Share, MessageSquare, Video, Search, 
  Undo, Redo, Printer, Bold, Italic, Underline, 
  AlignLeft, AlignCenter, AlignRight, FileText
} from 'lucide-react';

// ProseMirror Imports
import { EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark, setBlockType } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';


// Automerge Repo Imports
import { AutomergeUrl } from "@automerge/automerge-repo";
import { useDocHandle, useDocument } from "@automerge/automerge-repo-react-hooks";
import { init } from "@automerge/prosemirror";

import './App.css';

// --- FEATURE 2: Syncing Title ---
// Header now accepts title state and a change handler
const Header = ({ title, onTitleChange }: { title: string, onTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
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

const Toolbar = ({ 
  view, 
  editorState 
}: { 
  view: EditorView | null; 
  editorState: EditorState | null;
}) => {
  
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
        {/* Font dropdown mocked visually for now to prevent sync crashes */}
        <select className="toolbar-select">
          <option value="Arial">Arial</option>
        </select>
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

// --- FEATURE 1: Dynamic Outline ---
const Sidebar = ({ editorState, view }: { editorState: EditorState | null, view: EditorView | null }) => {
  // Extract headings from the current document state
  const headings: { text: string, level: number, pos: number, id: string }[] = [];
  
  if (editorState) {
    editorState.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        headings.push({
          text: node.textContent || 'Empty heading',
          level: node.attrs.level,
          pos: pos,
          id: `heading-${pos}`
        });
      }
    });
  }

  // Handle clicking a heading to scroll to it
  const scrollToHeading = (pos: number) => {
    if (!view) return;
    const tr = view.state.tr;
    // Set cursor at the heading and scroll it into the viewport
    tr.setSelection(TextSelection.create(tr.doc, pos));
    tr.scrollIntoView();
    view.dispatch(tr);
    view.focus();
  };

  return (
    <aside className="docs-sidebar">
      <div className="sidebar-header">
        <span className="font-semibold">Document outline</span>
      </div>
      <div className="sidebar-content">
        {headings.length === 0 ? (
          <div className="text-muted text-sm">Headings you add to the document will appear here.</div>
        ) : (
          <div className="outline-list">
            {headings.map(h => (
              <div 
                key={h.id} 
                className="outline-item" 
                style={{ paddingLeft: `${(h.level - 1) * 16}px` }}
                onClick={() => scrollToHeading(h.pos)}
              >
                {h.text}
              </div>
            ))}
          </div>
        )}
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
        // --- FEATURE 3: Remote Selection Highlighting ---
        // Ensure boundaries don't crash ProseMirror if doc sizes are briefly out of sync
        const safeHead = Math.max(0, Math.min(c.head, docSize));
        const safeAnchor = Math.max(0, Math.min(c.anchor, docSize));
        
        // If the user has highlighted text, draw a background color over it
        if (safeHead !== safeAnchor) {
          const from = Math.min(safeHead, safeAnchor);
          const to = Math.max(safeHead, safeAnchor);
          decos.push(Decoration.inline(from, to, {
            // Append '40' to hex color for ~25% opacity highlight
            style: `background-color: ${c.color}40;` 
          }));
        }
        
        // Draw the standard cursor caret at the 'head' (where their mouse is)
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

  useEffect(() => {
    if (handle) {
      handle.whenReady().then(() => {
        if (handle.docSync() != null) setLoaded(true);
      });
    }
  }, [handle]);

  useEffect(() => {
    if (!editorRoot.current || !loaded || !handle) return;
    
    // FIX: Use the pure schema and document provided by Automerge
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

export default function App({ docUrl }: { docUrl: AutomergeUrl }) {
  const [sidebarOpen] = useState(true);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);

  // Attach the document hook to manage the Title property globally
  const [doc, changeDoc] = useDocument<{ title?: string, text: string }>(docUrl);
  
  // Safely fallback to "Untitled document" if the title property hasn't been set yet
  const title = doc?.title || "Untitled document";

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    changeDoc((d) => {
      d.title = e.target.value;
    });
  };

  return (
    <div className="app-container">
      <Header title={title} onTitleChange={handleTitleChange} />
      
      {/* FIX: Removed font={font} setFont={setFont} */}
      <Toolbar view={editorView} editorState={editorState} /> 
      
      <main className="main-workspace">
        {sidebarOpen && <Sidebar editorState={editorState} view={editorView} />}
        <section className="editor-container">
          
          {/* FIX: Removed style={{ fontFamily: font }} */}
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