export function isPureFT(inst) {
  const labels = inst.labels || [];
  const ftLabel = labels.find(l => (l.group || '').toLowerCase().includes('free throw'));
  if (!ftLabel) return false;
  if (ftLabel.name !== '+FT' && ftLabel.name !== '-FT') return false;
  const groups = labels.map(l => (l.group || '').toLowerCase());
  const actionGroups = ['shooting','rebounding','situation','turnovers','play type','playtype','result'];
  if (groups.some(g => actionGroups.includes(g))) return false;
  const dur = (inst.endTime || 0) - (inst.startTime || 0);
  return dur <= 15;
}

export function instDetail(inst) {
  const labels = inst.labels || [];
  const player = labels.find(l => (l.name || '').startsWith('#'))?.name || '';
  const dur = (inst.endTime || 0) - (inst.startTime || 0);
  return player ? `${player} (${dur.toFixed(1)}s)` : `(${dur.toFixed(1)}s)`;
}

export function buildAssignments(offRow, plays) {
  const insts = (offRow.instances || []).slice()
    .sort((a, b) => (Number(a.startTime) || 0) - (Number(b.startTime) || 0));

  const out = [];
  let excelPtr = 0;
  let lastQ = plays.length > 0 ? plays[0].quarter : '1Q';
  let lastSecs = 12 * 60;

  for (const inst of insts) {
    if (isPureFT(inst)) {
      out.push({
        uniqueId: inst.uniqueId, kind: 'ft',
        quarter: lastQ, seconds: lastSecs,
        type: '', callRaw: '', callClean: '(FT)',
        detail: instDetail(inst)
      });
    } else {
      if (excelPtr < plays.length) {
        const p = plays[excelPtr++];
        lastQ = p.quarter; lastSecs = p.seconds;
        out.push({
          uniqueId: inst.uniqueId, kind: 'play',
          quarter: p.quarter, seconds: p.seconds,
          type: p.type, callRaw: p.callRaw, callClean: p.callClean,
          detail: instDetail(inst)
        });
      } else {
        out.push({
          uniqueId: inst.uniqueId, kind: 'leftover',
          quarter: lastQ, seconds: lastSecs,
          type: '', callRaw: '', callClean: '',
          detail: instDetail(inst)
        });
      }
    }
  }
  return out;
}
