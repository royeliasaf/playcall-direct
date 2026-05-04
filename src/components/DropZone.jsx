import { useRef, useState } from 'react';

export default function DropZone({ label, accept, onFile, onFolder, status, loaded, meta, error }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const items = e.dataTransfer.items;
    const files = e.dataTransfer.files;
    if (onFolder && items && items.length > 0 && items[0].webkitGetAsEntry) {
      const entry = items[0].webkitGetAsEntry();
      if (entry && entry.isDirectory) { onFolder(entry); return; }
    }
    if (files[0]) onFile(files[0]);
  };

  const baseClass = `drop-zone${dragging ? ' dragging' : ''}${loaded ? ' loaded' : ''}`;

  return (
    <div>
      <label
        className={baseClass}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {loaded ? (
          <>
            <span className="drop-icon">✓</span>
            <span className="drop-loaded-name">{loaded}</span>
            {meta && <span className="drop-meta">{meta}</span>}
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
      {status && <div className="drop-status">{status}</div>}
      {error && <div className="banner banner-error">{error}</div>}
    </div>
  );
}
