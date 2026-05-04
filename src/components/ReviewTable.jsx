import { fmtSeconds } from '../lib/utils.js';

const TYPE_COLORS = {
  ATO: '#d4523f',
  SOB: '#2d5a8f',
  BOB: '#5a8f3f',
  FT: '#c97a1f',
  EMPTY: '#c8102e',
};

function TypePill({ type }) {
  if (!type) return null;
  const bg = TYPE_COLORS[type] || '#e0ddd6';
  const color = TYPE_COLORS[type] ? '#fff' : '#555';
  return (
    <span className="pill" style={{ background: bg, color }}>
      {type}
    </span>
  );
}

export default function ReviewTable({ assignments, onCallChange }) {
  let lastQ = null;
  const rows = [];

  assignments.forEach((a, i) => {
    if (a.kind === 'leftover') return;

    if (a.quarter !== lastQ) {
      rows.push(
        <tr key={`divider-${a.quarter}`} className="q-divider">
          <td colSpan={6}>— {a.quarter} —</td>
        </tr>
      );
      lastQ = a.quarter;
    }

    const rowClass = a.kind === 'ft' ? 'row-ft' : '';

    let typeCell = null;
    if (a.kind === 'ft') typeCell = <TypePill type="FT" />;
    else if (a.type) typeCell = <TypePill type={a.type} />;

    rows.push(
      <tr key={a.uniqueId || i} className={rowClass}>
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
            <th style={{ width: 80 }}>Game Clock</th>
            <th style={{ width: 60 }}>Type</th>
            <th>Clip</th>
            <th>Coach's Raw Call</th>
            <th style={{ width: '35%' }}>Will Write</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}
