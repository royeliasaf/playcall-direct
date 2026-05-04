import { useState, useRef, useCallback } from 'react';
import DropZone from './components/DropZone.jsx';
import StatsBar from './components/StatsBar.jsx';
import ReviewTable from './components/ReviewTable.jsx';
import { handleZip, handleFolder } from './lib/zipHandler.js';
import { parseExcelFile } from './lib/excelParser.js';
import { buildAssignments } from './lib/matching.js';
import { generate } from './lib/generate.js';
import { downloadExcelTemplate } from './lib/excelTemplate.js';

const INITIAL_ENGINE = {
  zipEntries: [], zipReader: null, zipFile: null,
  timelineEntry: null, timelinePath: '', timelineData: null,
  folderInZipName: '', scVideoRelPath: '',
  offRow: null, defRow: null, videoInfo: null,
  scoutedTeamName: '', opposingTeamName: '',
  gameDate: '', connector: '@',
  cleanReport: null, excelFile: null,
};

export default function App() {
  const engine = useRef({ ...INITIAL_ENGINE });
  const [zipState, setZipState] = useState({ status: 'idle', loaded: null, meta: null, error: null });
  const [excelState, setExcelState] = useState({ status: 'idle', loaded: null, meta: null, error: null });
  const [plays, setPlays] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [genState, setGenState] = useState({ status: 'idle', progress: '', pct: 0, result: null, error: null });

  const hasZip = zipState.status === 'loaded';
  const hasExcel = excelState.status === 'loaded';
  const canBuild = hasZip && hasExcel && plays.length > 0;

  const tryAssign = useCallback((newPlays, offRow) => {
    const p = newPlays ?? plays;
    const o = offRow ?? engine.current.offRow;
    if (!o || p.length === 0) return;
    setAssignments(buildAssignments(o, p));
  }, [plays]);

  const onZipFile = async (file) => {
    setZipState({ status: 'loading', loaded: null, meta: null, error: null });
    try {
      const result = await handleZip(file);
      Object.assign(engine.current, result);
      setZipState({ status: 'loaded', loaded: `${result.folderInZipName || file.name}`, meta: `${result.displayName} · ${result.offClipCount} offense clips`, error: null });
      tryAssign(plays, result.offRow);
    } catch (e) {
      setZipState({ status: 'error', loaded: null, meta: null, error: e.message });
    }
  };

  const onFolder = async (rootEntry) => {
    setZipState({ status: 'loading', loaded: null, meta: null, error: null });
    try {
      const result = await handleFolder(rootEntry);
      Object.assign(engine.current, result);
      setZipState({ status: 'loaded', loaded: `${result.folderInZipName || rootEntry.name}`, meta: `${result.displayName} · ${result.offClipCount} offense clips`, error: null });
      tryAssign(plays, result.offRow);
    } catch (e) {
      setZipState({ status: 'error', loaded: null, meta: null, error: e.message });
    }
  };

  const onExcelFile = async (file) => {
    setExcelState({ status: 'loading', loaded: null, meta: null, error: null });
    try {
      engine.current.excelFile = file;
      const parsed = await parseExcelFile(file);
      setPlays(parsed);
      setExcelState({ status: 'loaded', loaded: file.name, meta: `${parsed.length} plays parsed`, error: null });
      tryAssign(parsed, engine.current.offRow);
    } catch (e) {
      setExcelState({ status: 'error', loaded: null, meta: null, error: e.message });
    }
  };

  const onCallChange = useCallback((i, value) => {
    setAssignments(prev => {
      const next = [...prev];
      next[i] = { ...next[i], callClean: value };
      return next;
    });
  }, []);

  const onBuild = async () => {
    setGenState({ status: 'building', progress: 'Starting…', pct: 0, result: null, error: null });
    try {
      const result = await generate({ ...engine.current, assignments }, (text, pct) =>
        setGenState(s => ({ ...s, progress: text, pct }))
      );
      if (result === null) { setGenState({ status: 'idle', progress: '', pct: 0, result: null, error: null }); return; }
      setGenState({ status: 'done', progress: '', pct: 100, result, error: null });
    } catch (e) {
      setGenState({ status: 'error', progress: '', pct: 0, result: null, error: e.message });
    }
  };

  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="header">
        <div className="container">
          <div className="header-top">
            <div className="logo">
              <span className="logo-icon">▶</span>
              <span className="logo-text">PlayCall Direct</span>
              <span className="logo-version">v1.0</span>
            </div>
            <p className="header-tagline">Drop two files. Get a full labeled game pack. No extra steps.</p>
          </div>
        </div>
      </header>

      <main className="container main">

        {/* ── How it works ── */}
        <section className="how-it-works">
          <div className="how-grid">
            <div className="how-step">
              <div className="how-num">1</div>
              <div className="how-body">
                <div className="how-title">Drop your .SCVideo</div>
                <div className="how-desc">Zip the bundle in Finder and drop it here. The tool reads the timeline, detects both teams, and auto-cleans the rows.</div>
              </div>
            </div>
            <div className="how-arrow">→</div>
            <div className="how-step">
              <div className="how-num">2</div>
              <div className="how-body">
                <div className="how-title">Drop the coach's Excel</div>
                <div className="how-desc">One row per offensive play, in order. Free throws are auto-detected. Every play must be filled — write <strong>NOTHING</strong> if there was no call.</div>
              </div>
            </div>
            <div className="how-arrow">→</div>
            <div className="how-step">
              <div className="how-num">3</div>
              <div className="how-body">
                <div className="how-title">Get your full game pack</div>
                <div className="how-desc">Review the matches, hit Build, and download a ready-to-import .SCVideo with everything inside.</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Output breakdown ── */}
        <section className="output-section">
          <div className="output-label">What's inside the output</div>
          <div className="output-grid">
            <div className="output-item">
              <span className="output-icon">🎬</span>
              <div>
                <div className="output-item-title">Cleaned .SCVideo</div>
                <div className="output-item-desc">Timeline with play call labels + Full Game row built in</div>
              </div>
            </div>
            <div className="output-item">
              <span className="output-icon">⚔️</span>
              <div>
                <div className="output-item-title">Offense Sorter</div>
                <div className="output-item-desc">SCPlaylist with all offensive clips, labeled</div>
              </div>
            </div>
            <div className="output-item">
              <span className="output-icon">🛡️</span>
              <div>
                <div className="output-item-title">Defense Sorter</div>
                <div className="output-item-desc">SCPlaylist with all defensive clips</div>
              </div>
            </div>
            <div className="output-item">
              <span className="output-icon">🏀</span>
              <div>
                <div className="output-item-title">Full Game Sorter</div>
                <div className="output-item-desc">Both teams merged in chronological order</div>
              </div>
            </div>
            <div className="output-item">
              <span className="output-icon">📊</span>
              <div>
                <div className="output-item-title">Coach's Excel</div>
                <div className="output-item-desc">Original spreadsheet included in the pack</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Step 1: SCVideo ── */}
        <section className="card">
          <div className="card-header">
            <div className="step-badge">Step 1</div>
            <h2>Drop your zipped .SCVideo</h2>
          </div>
          <p className="card-desc">
            In Finder, right-click the <code>.SCVideo</code> bundle → <strong>Compress</strong>, then drop the <code>.zip</code> here. You can also drop the raw folder directly.
          </p>
          <DropZone
            label="Drop .SCVideo.zip here — or click to browse"
            accept=".zip"
            onFile={onZipFile}
            onFolder={onFolder}
            status={zipState.status === 'loading' ? 'loading' : null}
            loaded={zipState.status === 'loaded' ? { name: zipState.loaded, meta: zipState.meta } : null}
            error={zipState.error}
          />
        </section>

        {/* ── Step 2: Excel ── */}
        <section className="card">
          <div className="card-header">
            <div className="step-badge">Step 2</div>
            <h2>Drop the coach's play call Excel</h2>
          </div>

          <div className="warning-box">
            <span className="warning-icon">⚠️</span>
            <div>
              <strong>Every offensive play must have an entry.</strong> If there was no play call, write <code>NOTHING</code>. Blank rows will cause plays to match the wrong clips. One row per play, in chronological order.
            </div>
          </div>

          <p className="card-desc" style={{ marginTop: 14 }}>
            Need a template?{' '}
            <button className="btn-link" onClick={downloadExcelTemplate}>
              Download the coach's Excel template ↓
            </button>
          </p>

          <DropZone
            label="Drop .xlsx here — or click to browse"
            accept=".xlsx,.xls"
            onFile={onExcelFile}
            status={excelState.status === 'loading' ? 'loading' : null}
            loaded={excelState.status === 'loaded' ? { name: excelState.loaded, meta: excelState.meta } : null}
            error={excelState.error}
          />
        </section>

        {/* ── Build ── */}
        <section className="card card-build">
          <div className="card-header">
            <div className="step-badge">Step 3</div>
            <h2>Build your game pack</h2>
          </div>
          <p className="card-desc">
            When the matches look right, click Build. The tool writes all play call labels into the timeline, builds the Full Game row, and packages everything into a single zip ready to import into Sportscode.
          </p>

          <button className="btn-build" onClick={onBuild} disabled={!canBuild || genState.status === 'building'}>
            {genState.status === 'building' ? (
              <><span className="btn-spinner" />Building…</>
            ) : (
              '⬇  Build Game Pack'
            )}
          </button>

          {!canBuild && genState.status === 'idle' && (
            <p className="build-hint">
              {!hasZip && !hasExcel ? 'Drop your .SCVideo and Excel to get started.' :
               !hasZip ? 'Still need: .SCVideo zip.' :
               !hasExcel ? 'Still need: coach\'s Excel.' :
               'Parsing plays…'}
            </p>
          )}

          {genState.status === 'building' && (
            <div className="progress-block">
              <div className="progress-text">{genState.progress}</div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${genState.pct.toFixed(1)}%` }} /></div>
            </div>
          )}

          {genState.status === 'done' && genState.result && <DoneBanner result={genState.result} />}
          {genState.status === 'error' && <div className="banner banner-error">⚠ Build failed: {genState.error}</div>}
        </section>

        {/* ── Review ── */}
        {assignments.length > 0 && (
          <section className="card">
            <div className="card-header">
              <div className="step-badge step-badge-review">Review</div>
              <h2>Match review</h2>
            </div>
            <p className="card-desc">
              Each offense clip is matched to one Excel play in order. Free throws are auto-detected and skipped. Edit any play call inline — changes write directly into the timeline.
            </p>
            <StatsBar assignments={assignments} plays={plays} />
            <div className="notice-good">
              ✓ <strong>{assignments.filter(a => a.kind === 'ft').length} FT clips</strong> auto-labeled &nbsp;·&nbsp;
              <strong>{assignments.filter(a => a.kind === 'play').length} plays</strong> matched
              {assignments.filter(a => a.kind === 'leftover').length > 0 &&
                <> &nbsp;·&nbsp; <span className="notice-warn">{assignments.filter(a => a.kind === 'leftover').length} clips unmatched</span></>
              }
            </div>
            <ReviewTable assignments={assignments} onCallChange={onCallChange} />
          </section>
        )}

      </main>

      <footer className="footer">
        <div className="container">
          <span>PlayCall Direct · All processing happens in your browser — no files uploaded to any server.</span>
          <span className="footer-credit">A Roy Eliasaf project</span>
        </div>
      </footer>
    </div>
  );
}

function DoneBanner({ result }) {
  const { kind, outputName, url, sizeMB, writtenCount, fullGameClipCount, assignments } = result;
  const leftover = assignments.filter(a => a.kind === 'leftover').length;
  return (
    <div className="done-banner">
      <div className="done-check">✓</div>
      <div className="done-body">
        <div className="done-title">
          {kind === 'streamed' ? `Saved as ${outputName}` : `Ready — ${sizeMB} MB`}
        </div>
        <div className="done-detail">
          <span className="done-stat">{writtenCount} play calls written</span>
          <span className="done-stat">{fullGameClipCount} Full Game clips</span>
          <span className="done-stat">3 sorters built</span>
          {leftover > 0 && <span className="done-stat done-stat-warn">{leftover} clips unmatched</span>}
        </div>
        <p className="done-note">Unzip and drag the <code>.SCVideo</code> into Sportscode — play calls appear on both timeline rows and all sorter views.</p>
        {kind === 'blob' && (
          <a href={url} download={outputName} className="btn-download">⬇  Download {outputName}</a>
        )}
      </div>
    </div>
  );
}
