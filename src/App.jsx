import { useState, useRef, useCallback } from 'react';
import DropZone from './components/DropZone.jsx';
import StatsBar from './components/StatsBar.jsx';
import ReviewTable from './components/ReviewTable.jsx';
import { handleZip, handleFolder } from './lib/zipHandler.js';
import { parseExcelFile } from './lib/excelParser.js';
import { buildAssignments } from './lib/matching.js';
import { generate } from './lib/generate.js';

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

  const [zipState, setZipState] = useState({ status: 'idle', loaded: null, meta: null, error: null, folderProgress: null });
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
    const result = buildAssignments(o, p);
    setAssignments(result);
  }, [plays]);

  const onZipFile = async (file) => {
    setZipState({ status: 'loading', loaded: null, meta: null, error: null, folderProgress: null });
    try {
      const result = await handleZip(file);
      Object.assign(engine.current, result);
      setZipState({
        status: 'loaded',
        loaded: `📁 ${result.folderInZipName || file.name}`,
        meta: `${result.displayName} · OFF: ${result.offClipCount} clips`,
        error: null,
        folderProgress: null,
      });
      tryAssign(plays, result.offRow);
    } catch (e) {
      setZipState({ status: 'error', loaded: null, meta: null, error: e.message, folderProgress: null });
    }
  };

  const onFolder = async (rootEntry) => {
    setZipState({ status: 'loading', loaded: null, meta: null, error: null, folderProgress: 0 });
    try {
      const result = await handleFolder(rootEntry, (n) => {
        setZipState(s => ({ ...s, folderProgress: n }));
      });
      Object.assign(engine.current, result);
      setZipState({
        status: 'loaded',
        loaded: `📁 ${result.folderInZipName || rootEntry.name}`,
        meta: `${result.displayName} · OFF: ${result.offClipCount} clips`,
        error: null,
        folderProgress: null,
      });
      tryAssign(plays, result.offRow);
    } catch (e) {
      setZipState({ status: 'error', loaded: null, meta: null, error: e.message, folderProgress: null });
    }
  };

  const onExcelFile = async (file) => {
    setExcelState({ status: 'loading', loaded: null, meta: null, error: null });
    try {
      engine.current.excelFile = file;
      const parsed = await parseExcelFile(file);
      setPlays(parsed);
      setExcelState({
        status: 'loaded',
        loaded: `📊 ${file.name}`,
        meta: `${parsed.length} plays parsed`,
        error: null,
      });
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
    setGenState({ status: 'building', progress: 'Starting...', pct: 0, result: null, error: null });
    try {
      const onProgress = (text, pct) => setGenState(s => ({ ...s, progress: text, pct }));
      const result = await generate(
        { ...engine.current, assignments },
        onProgress
      );
      if (result === null) {
        // User cancelled save dialog
        setGenState({ status: 'idle', progress: '', pct: 0, result: null, error: null });
        return;
      }
      setGenState({ status: 'done', progress: '', pct: 100, result, error: null });
    } catch (e) {
      setGenState({ status: 'error', progress: '', pct: 0, result: null, error: e.message });
      console.error(e);
    }
  };

  const numFT = assignments.filter(a => a.kind === 'ft').length;
  const numMatched = assignments.filter(a => a.kind === 'play').length;
  const numLeftover = assignments.filter(a => a.kind === 'leftover').length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <h1>PlayCall Direct <span className="version">v1.0</span></h1>
          <p className="subtitle">
            Drops the <strong>Save to Source</strong> step entirely. Drop your zipped{' '}
            <code>.SCVideo</code> bundle and the coach's Excel — tool cleans the timeline,
            matches play calls, builds the FULL GAME row + sorter, and writes a labeled{' '}
            <code>.SCVideo</code> ready to ship.
          </p>
        </div>
      </header>

      <main className="app-main">
        <section className="card">
          <h3>Step 1 — Drop your zipped <code>.SCVideo</code></h3>
          <p className="desc">
            In Finder, right-click the <code>.SCVideo</code> bundle → Compress, then drop the
            resulting <code>.zip</code> here. You can also drop the raw folder directly.
          </p>
          <DropZone
            label="Drop .SCVideo.zip here — or click to choose"
            accept=".zip"
            onFile={onZipFile}
            onFolder={onFolder}
            status={
              zipState.status === 'loading'
                ? zipState.folderProgress != null
                  ? <div className="progress-inline">⏳ Reading folder… {zipState.folderProgress} files scanned</div>
                  : <div className="progress-inline">⏳ Reading zip…</div>
                : null
            }
            loaded={zipState.status === 'loaded' ? zipState.loaded : null}
            meta={zipState.meta}
            error={zipState.error}
          />
        </section>

        <section className="card">
          <h3>Step 2 — Coach's Excel</h3>
          <p className="desc">Drop the coach's filled <code>.xlsx</code> with the play calls.</p>
          <DropZone
            label="Drop .xlsx here, or click to choose"
            accept=".xlsx,.xls"
            onFile={onExcelFile}
            status={excelState.status === 'loading' ? <div className="progress-inline">⏳ Reading Excel…</div> : null}
            loaded={excelState.status === 'loaded' ? excelState.loaded : null}
            meta={excelState.meta}
            error={excelState.error}
          />
        </section>

        {assignments.length > 0 && (
          <section className="card">
            <h3>Review matches</h3>
            <p className="desc">
              Each clip in the offense row is matched to one Excel play in order. Pure free throws
              are auto-labeled <code>(FT)</code>. Edit any play call inline — your edits write into
              the timeline.
            </p>

            <StatsBar assignments={assignments} plays={plays} />

            <div className="notice notice-good">
              <strong>✓ {numFT} FT clips auto-labeled, {numMatched} clips matched.</strong>{' '}
              Click <em>Build .SCVideo</em> to write them in.
              {numLeftover > 0 && <> · {numLeftover} clips left empty for manual fill.</>}
            </div>

            <ReviewTable assignments={assignments} onCallChange={onCallChange} />
          </section>
        )}

        <section className="card card-build">
          <button
            className="btn-build"
            onClick={onBuild}
            disabled={!canBuild || genState.status === 'building'}
          >
            {genState.status === 'building' ? 'Building…' : 'Build .SCVideo'}
          </button>

          {genState.status === 'building' && (
            <div className="progress-block">
              <div className="progress-text">⏳ {genState.progress}</div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${genState.pct.toFixed(1)}%` }} />
              </div>
            </div>
          )}

          {genState.status === 'done' && genState.result && (
            <DoneBanner result={genState.result} />
          )}

          {genState.status === 'error' && (
            <div className="banner banner-error">⚠ Build failed: {genState.error}</div>
          )}
        </section>
      </main>
    </div>
  );
}

function DoneBanner({ result }) {
  const { kind, outputName, url, sizeMB, writtenCount, fullGameClipCount, assignments } = result;
  const totalClips = assignments.length;
  const leftover = assignments.filter(a => a.kind === 'leftover').length;

  return (
    <div className="banner banner-ok">
      <strong>
        {kind === 'streamed'
          ? `✅ Done — saved as ${outputName}`
          : `✅ Done — ${sizeMB} MB`}
      </strong>
      <div className="done-detail">
        Wrote <strong>{writtenCount}</strong> play calls into {totalClips} offense clips
        {leftover > 0 && ` · ${leftover} left empty for manual fill`}
        {' · Updated '}
        <strong>3</strong> sorters
        {fullGameClipCount > 0 && ` · Built FULL GAME row with `}
        {fullGameClipCount > 0 && <strong>{fullGameClipCount}</strong>}
        {fullGameClipCount > 0 && ' clips'}.
        <br />
        Unzip and open the <code>.SCVideo</code> in Sportscode — play calls show on both
        timeline rows and sorter views.
        {kind === 'blob' && (
          <>
            {' '}
            <a href={url} download={outputName} className="download-link">
              ⬇ Download {outputName}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
