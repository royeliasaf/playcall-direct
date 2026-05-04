import * as XLSX from 'xlsx';

function timeToSeconds(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;
    if (s.startsWith(':')) {
      const n = parseInt(s.slice(1), 10);
      return isNaN(n) ? null : n;
    }
    if (s.includes(':')) {
      const parts = s.split(':');
      const m = parseInt(parts[0], 10), sec = parseInt(parts[1], 10);
      if (isNaN(m) || isNaN(sec)) return null;
      return m * 60 + sec;
    }
    if (/^\d+$/.test(s)) return parseIntClock(parseInt(s, 10));
    return null;
  }
  if (typeof val === 'number') {
    if (val < 1) {
      const total = Math.round(val * 24 * 60 * 60);
      return Math.floor(total / 3600) * 60 + Math.floor((total % 3600) / 60);
    }
    return parseIntClock(Math.round(val));
  }
  return null;
}

function parseIntClock(n) {
  const s = String(n);
  if (s.length <= 2) return parseInt(s, 10);
  const mins = parseInt(s.slice(0, -2), 10);
  const secs = parseInt(s.slice(-2), 10);
  return mins * 60 + secs;
}

function splitCall(raw) {
  if (!raw) return { type: '', clean: '' };
  let s = String(raw).trim();
  let type = '';
  const m = s.match(/^\(?(ATO|SOB|BOB|DEF)\)?\s*[-:]?\s*(.*)$/i);
  if (m) {
    type = m[1].toUpperCase();
    s = m[2].trim();
  }
  if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1).trim();
  s = s.replace(/\s*-\s*$/, '').replace(/\s+/g, ' ').trim();
  let clean = s.toUpperCase();
  if (!clean && type) clean = type;
  return { type, clean };
}

function findCallColumn(rows, timeCol, maxCols) {
  for (let c = timeCol + 1; c < maxCols; c++) {
    let nonEmpty = 0, looksLikeTime = 0;
    for (const row of rows) {
      if (!row) continue;
      const v = row[c];
      if (v == null || String(v).trim() === '') continue;
      nonEmpty++;
      if (timeToSeconds(v) != null) looksLikeTime++;
    }
    if (nonEmpty >= 5 && looksLikeTime / nonEmpty < 0.3) return c;
  }
  return null;
}

function sniffQuarter(cell) {
  if (cell == null) return null;
  const s = String(cell).trim().toUpperCase().replace(/[\s\-_\.]+/g, '');
  if (/^[1-4]Q$/.test(s)) return s;
  if (/^Q[1-4]$/.test(s)) return s.slice(1) + 'Q';
  if (/^OT[1-9]?$/.test(s)) return s === 'OT' ? 'OT1' : s;
  if (s === 'OVERTIME') return 'OT1';
  if (/^1ST$|^FIRST$/.test(s)) return '1Q';
  if (/^2ND$|^SECOND$/.test(s)) return '2Q';
  if (/^3RD$|^THIRD$/.test(s)) return '3Q';
  if (/^4TH$|^FOURTH$/.test(s)) return '4Q';
  return null;
}

function dedupePlays(arr) {
  const seen = new Set();
  const out = [];
  for (const p of arr) {
    const key = `${p.quarter}|${p.seconds}|${p.callRaw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function sortPlays(arr) {
  const order = { '1Q':1,'2Q':2,'3Q':3,'4Q':4,'OT1':5,'OT2':6 };
  return arr.sort((a, b) => {
    const qa = order[a.quarter] || 99, qb = order[b.quarter] || 99;
    if (qa !== qb) return qa - qb;
    return b.seconds - a.seconds;
  });
}

// Sequential parser for no-time sheets (TYPE | Quarter | CALL format)
function parseSequential(rows) {
  const plays = [];
  let curQ = null;
  let seqSecs = 720; // start at 12:00, count down for display only

  for (const row of rows) {
    if (!row) continue;
    // Try to find a quarter marker anywhere in the row
    for (const cell of row) {
      const q = sniffQuarter(cell);
      if (q) { curQ = q; seqSecs = 720; break; }
    }

    // Last non-null cell is the CALL, first cell is TYPE
    const cells = row.map(c => (c == null ? '' : String(c).trim()));
    const callCell = [...cells].reverse().find(c => c !== '');
    const typeCell = cells[0];

    if (!callCell || !curQ) continue;

    // Skip header rows
    const up = callCell.toUpperCase();
    if (up === 'CALL' || up === 'TYPE' || up === 'DATE:' || up.includes('SCOUTED TEAM')) continue;
    if (sniffQuarter(callCell)) continue;

    const split = splitCall(callCell);
    const explicitType = typeCell ? typeCell.toUpperCase() : '';
    const type = split.type || (['ATO','SOB','BOB','DEF','COB'].includes(explicitType) ? explicitType : '');
    if (type === 'DEF') continue;

    plays.push({ quarter: curQ, seconds: seqSecs, callRaw: callCell, type, callClean: split.clean });
    seqSecs = Math.max(0, seqSecs - 30);
  }
  return plays;
}

export function parseWorkbook(wb) {
  const allPlays = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (!rows.length) continue;

    const maxCols = rows.reduce((m, r) => Math.max(m, (r || []).length), 0);
    const timeColScores = [];
    for (let c = 0; c < maxCols; c++) {
      let timeHits = 0, total = 0;
      for (const row of rows) {
        if (!row) continue;
        const v = row[c];
        if (v == null || String(v).trim() === '') continue;
        total++;
        if (timeToSeconds(v) != null) timeHits++;
      }
      timeColScores.push({ col: c, score: total > 0 ? timeHits / total : 0, total, timeHits });
    }
    const timeCols = timeColScores.filter(s => s.timeHits >= 5 && s.score >= 0.4).map(s => s.col);

    // No time columns found — fall back to sequential quarter-section parsing
    if (timeCols.length === 0) {
      allPlays.push(...parseSequential(rows));
      continue;
    }

    for (const tCol of timeCols) {
      const callCol = findCallColumn(rows, tCol, maxCols);
      if (callCol == null) continue;
      const typeCol = tCol > 0 ? tCol - 1 : null;

      let curQ = null;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const tCell = typeCol != null ? row[typeCol] : null;
        const timeCell = row[tCol];
        const cCell = row[callCol];

        const qMaybe = sniffQuarter(tCell) || sniffQuarter(timeCell) || sniffQuarter(cCell);
        if (qMaybe) { curQ = qMaybe; continue; }

        const cStr = cCell == null ? '' : String(cCell).trim();
        if (!cStr) continue;
        const cUp = cStr.toUpperCase();
        if (['PLAY CALL','NOTES','DEFENSE','"CALL" (VISUAL)','CALL'].includes(cUp)) continue;
        if (cUp.includes('GAME:') || cUp.includes('COACH:')) continue;

        const secs = timeToSeconds(timeCell);
        if (secs == null) continue;
        if (!curQ) curQ = '1Q';

        const explicitType = tCell ? String(tCell).trim().toUpperCase() : '';
        const split = splitCall(cStr);
        const type = split.type || (['ATO','SOB','BOB','DEF','COB','AFT','EOG','EOQ'].includes(explicitType) ? explicitType : '');
        if (type === 'DEF') continue;

        allPlays.push({ quarter: curQ, seconds: secs, callRaw: cStr, type, callClean: split.clean });
      }
    }
  }
  return sortPlays(dedupePlays(allPlays));
}

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: false });
        resolve(parseWorkbook(wb));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
