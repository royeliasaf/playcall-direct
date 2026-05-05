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

function fmtVideoTime(secs) {
  if (secs == null) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}

export function instMeta(inst, index) {
  const labels = inst.labels || [];
  const player = labels.find(l => (l.name || '').startsWith('#'))?.name || '';
  const existingCall = labels.find(l => l.group === 'PLAY CALL')?.name || '';
  const situation = labels.find(l => l.group === 'SITUATION' || l.group === 'Situation')?.name || '';
  const dur = ((inst.endTime || 0) - (inst.startTime || 0)).toFixed(1);
  const videoTime = fmtVideoTime(inst.startTime);
  return { player, existingCall, situation, dur, videoTime, instanceNum: inst.instanceNum || index + 1 };
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
          detail: instDetail(inst),
          meta: instMeta(inst, out.length),
        });
      }
    }
  }
  return out;
}
