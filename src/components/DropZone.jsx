import { useRef, useState } from 'react';

export default function DropZone({ label, accept, onFile, onFolder, status, loaded, error }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const items = e.dataTransfer.items;
    const files = e.dataTransfer.files;
    if (onFolder && items?.length > 0 && items[0].webkitGetAsEntry) {
      const entry = items[0].webkitGetAsEntry();
      if (entry?.isDirectory) { onFolder(entry); return; }
    }
    if (files[0]) onFile(files[0]);
  };

  const cls = ['drop-zone', dragging && 'dragging', loaded && 'loaded'].filter(Boolean).join(' ');

  return (
    <div>
      <label
        className={cls}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !loaded && inputRef.current?.click()}
        style={loaded ? { cursor: 'default' } : {}}
      >
        {status === 'loading' ? (
          <div className="drop-loading">
            <span className="spinner" />
            Reading file…
          </div>
        ) : loaded ? (
          <>
            <span style={{ fontSize: 20 }}>✓</span>
            <span className="drop-loaded-name">{loaded.name}</span>
            {loaded.meta && <span className="drop-meta">{loaded.meta}</span>}
          </>
        ) : (
          <span>{label}</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }}
        />
      </label>
      {error && <div className="banner-error">{error}</div>}
    </div>
  );
}
