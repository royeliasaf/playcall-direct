import { fmtSeconds } from '../lib/utils.js';

const TYPE_COLORS = {
  ATO: '#e8304e',
  SOB: '#3b82f6',
  BOB: '#22c55e',
  FT:  '#f59e0b',
};

function TypePill({ type }) {
  if (!type) return null;
  const bg = TYPE_COLORS[type] || '#374151';
  return (
    <span className="pill" style={{ background: bg, color: '#fff' }}>{type}</span>
  );
}

function PhantomRow({ a, i }) {
  const m = a.meta || {};
  const tags = [
    m.existingCall && `📋 ${m.existingCall}`,
    m.situation   && `🏷 ${m.situation}`,
    m.player      && m.player,
  ].filter(Boolean);

  return (
    <tr className="row-phantom">
      <td className="col-idx">{i + 1}</td>
      <td className="col-time" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
        {m.videoTime && <span className="phantom-time">▶ {m.videoTime}</span>}
      </td>
      <td><span className="pill pill-phantom">MISSING</span></td>
      <td className="col-detail">
        {tags.length > 0
          ? tags.map((t, ti) => <span key={ti} className="phantom-tag">{t}</span>)
          : <span style={{ color: 'var(--ink3)', fontStyle: 'italic' }}>Clip #{m.instanceNum} · {m.dur}s · not in Excel</span>
        }
      </td>
      <td className="col-raw" style={{ color: 'var(--yellow)', fontSize: 12 }}>
        Clip #{m.instanceNum} · {m.dur}s · add to Excel
      </td>
      <td className="col-edit">
        <span style={{ color: 'var(--ink3)', fontSize: 12, fontStyle: 'italic' }}>—</span>
      </td>
    </tr>
  );
}

export default function ReviewTable({ assignments, onCallChange }) {
  let lastQ = null;
  const rows = [];

  assignments.forEach((a, i) => {
    if (a.quarter !== lastQ) {
      rows.push(
        <tr key={`divider-${a.quarter}-${i}`} className="q-divider">
          <td colSpan={6}>— {a.quarter} —</td>
        </tr>
      );
      lastQ = a.quarter;
    }

    if (a.kind === 'leftover') {
      rows.push(<PhantomRow key={a.uniqueId || i} a={a} i={i} />);
      return;
    }

    let typeCell = null;
    if (a.kind === 'ft') typeCell = <TypePill type="FT" />;
    else if (a.type) typeCell = <TypePill type={a.type} />;

    rows.push(
      <tr key={a.uniqueId || i} className={a.kind === 'ft' ? 'row-ft' : ''}>
        <td className="col-idx">{i + 1}</td>
        <td className="col-time">{a.quarter} {fmtSeconds(a.seconds)}</td>
        <td>{typeCell}</td>
        <td className="col-detail">{a.detail}</td>
        <td className="col-raw">{a.callRaw}</td>
        <td className="col-edit">
          <input
            type="text"
            value={a.callClean}
            placeholder="(empty)"
            onChange={e => onCallChange(i, e.target.value)}
          />
        </td>
      </tr>
    );
  });

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th style={{ width: 90 }}>Time</th>
            <th style={{ width: 80 }}>Type</th>
            <th>Clip Info</th>
            <th>Coach's Call</th>
            <th style={{ width: '30%' }}>Will Write</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}
