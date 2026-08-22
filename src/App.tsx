import { useState, useEffect, useRef } from 'react';
import { 
  Star, Share, MessageSquare, Video, Search, 
  Undo, Redo, Printer, Bold, Italic, Underline, 
  AlignLeft, AlignCenter, AlignRight, FileText
} from 'lucide-react';

// ProseMirror Imports
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
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

// Helper function to check if a specific mark (like bold/italic) is active at the cursor
const isMarkActive = (state: EditorState | null, markType: any) => {
  if (!state) return false;
  const { from, $from, to, empty } = state.selection;
  if (empty) {
    return !!markType.isInSet(state.storedMarks || $from.marks());
  }
  return state.doc.rangeHasMark(from, to, markType);
};

// Toolbar now accepts BOTH view and editorState
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

  // Determine if our buttons should be highlighted
  const boldActive = isMarkActive(editorState, schema.marks.strong);
  const italicActive = isMarkActive(editorState, schema.marks.em);

  // Determine current block type for the dropdown
  let currentBlock = '0';
  if (editorState) {
    const { $from } = editorState.selection;
    if ($from.parent.type.name === 'heading') {
      currentBlock = $from.parent.attrs.level.toString();
    }
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
        {/* Wired up Dropdown */}
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
        {/* Added dynamic .active classes based on state */}
        <button 
          className={`icon-btn ${boldActive ? 'active' : ''}`} 
          onClick={() => applyMark(schema.marks.strong)}
        >
          <Bold size={16} />
        </button>
        <button 
          className={`icon-btn ${italicActive ? 'active' : ''}`} 
          onClick={() => applyMark(schema.marks.em)}
        >
          <Italic size={16} />
        </button>
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

const ProseMirrorEditor = ({ 
  docUrl, 
  onViewCreated,
  onStateChange // New prop to notify React when PM updates
}: { 
  docUrl: AutomergeUrl;
  onViewCreated: (view: EditorView | null) => void;
  onStateChange: (state: EditorState) => void;
}) => {
  const editorRoot = useRef<HTMLDivElement>(null);
  const handle = useDocHandle<{ text: string }>(docUrl);
  const [loaded, setLoaded] = useState(false);

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
        plugin 
      ]
    });

    const view = new EditorView(editorRoot.current, { 
      state,
      // Intercept transactions to keep React synced with ProseMirror
      dispatchTransaction(transaction) {
        const newState = view.state.apply(transaction);
        view.updateState(newState);
        onStateChange(newState);
      }
    });
    
    onViewCreated(view);
    onStateChange(state); // Set initial state

    return () => {
      onViewCreated(null);
      view.destroy();
    };
  }, [loaded, handle, onViewCreated, onStateChange]);

  return <div ref={editorRoot} className="prosemirror-mount" />;
};

export default function App({ docUrl }: { docUrl: AutomergeUrl }) {
  const [sidebarOpen] = useState(true);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null); // New state

  return (
    <div className="app-container">
      <Header />
      {/* Pass both view and state down */}
      <Toolbar view={editorView} editorState={editorState} />
      <main className="main-workspace">
        {sidebarOpen && <Sidebar />}
        <section className="editor-container">
          <div className="document-page">
            <ProseMirrorEditor 
              docUrl={docUrl} 
              onViewCreated={setEditorView}
              onStateChange={setEditorState} // Link the callback
            />
          </div>
        </section>
      </main>
    </div>
  );
}