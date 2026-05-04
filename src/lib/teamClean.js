import { NBA_TEAMS, ALL_CODES } from './constants.js';

export function teamCodeFromRowName(name) {
  const trimmed = (name || '').trim();
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  if (NBA_TEAMS[lower]) return NBA_TEAMS[lower];
  if (ALL_CODES.has(upper)) return upper;
  return null;
}

export function tcDetectTeams(ctx) {
  ctx.detectedTeams = [];
  const seen = new Set();
  for (const r of ctx.timelineData.timeline.rows) {
    const code = teamCodeFromRowName(r.name);
    if (code && !seen.has(code)) {
      seen.add(code);
      ctx.detectedTeams.push({ code, fullName: (r.name || '').trim(), color: r.color });
    }
  }
}

export function tcAutoSelectScoutedTeam(ctx) {
  if (ctx.detectedTeams.length === 0) {
    ctx.scoutedTeamCode = null;
    return;
  }
  const upper = ctx.originalFilename.toUpperCase();
  const codesInFilename = [];

  const fullNameHits = [];
  for (const [fullName, code] of Object.entries(NBA_TEAMS)) {
    const idx = upper.indexOf(fullName.toUpperCase());
    if (idx >= 0) fullNameHits.push({ idx, code });
  }
  fullNameHits.sort((a, b) => a.idx - b.idx);
  for (const h of fullNameHits) {
    if (!codesInFilename.includes(h.code)) codesInFilename.push(h.code);
  }

  const words = upper.split(/[^A-Z]+/).filter(Boolean);
  for (const w of words) {
    if (ALL_CODES.has(w) && !codesInFilename.includes(w)) {
      codesInFilename.push(w);
    }
  }

  for (const code of codesInFilename) {
    if (ctx.detectedTeams.some(t => t.code === code)) {
      ctx.scoutedTeamCode = code;
      return;
    }
  }
  ctx.scoutedTeamCode = ctx.detectedTeams[0].code;
}

export function tcBuildPlan(ctx) {
  ctx.plan = [];
  const rows = ctx.timelineData.timeline.rows;
  const colorToTeam = {};
  for (const t of ctx.detectedTeams) {
    colorToTeam[t.color] = t.code;
  }

  rows.forEach((r, idx) => {
    const name = (r.name || '').trim();
    const upper = name.toUpperCase();
    const color = r.color || '';
    const teamCodeForRow = teamCodeFromRowName(name);
    let action = 'KEEP';
    let newColor = color;
    let newName = name;
    let team = colorToTeam[color] || null;
    let reason = '';

    if (upper === 'FULL GAME') {
      action = 'DELETE';
      reason = 'stale full game';
    } else if (teamCodeForRow) {
      const code = teamCodeForRow;
      const needsRename = name !== code;
      const needsRecolor = color.toUpperCase() !== '#FFFFFF';
      if (needsRename || needsRecolor) {
        action = needsRename ? 'RENAME' : 'RECOLOR';
        newName = code;
        newColor = '#FFFFFF';
        reason = needsRename ? `team → ${code}` : 'team (white)';
      }
      team = code;
    } else if (upper.includes('MINUTES')) {
      action = 'DELETE';
      reason = 'MINUTES row';
    } else if (upper.endsWith('SHOTS')) {
      action = 'DELETE';
      reason = 'SHOTS row';
    } else if (name.startsWith('#')) {
      if (team && team !== ctx.scoutedTeamCode) {
        action = 'DELETE';
        reason = `${team} player`;
      } else if (team === ctx.scoutedTeamCode) {
        if (color.toUpperCase() !== '#FFFFFF') {
          action = 'RECOLOR';
          newColor = '#FFFFFF';
          reason = `${team} player (white)`;
        } else {
          reason = `${team} player`;
        }
      } else {
        action = 'KEEP';
        reason = 'unknown team — keep to be safe';
      }
    } else {
      action = 'KEEP';
      reason = 'unrecognized — keep';
    }

    ctx.plan.push({ rowIdx: idx, action, applied: true, name, newName,
      instances: (r.instances || []).length, oldColor: color, newColor, team, reason });
  });
}

export function tcReorderRows(rows, ctx) {
  const scoutedTeamRow = [];
  const otherTeamRows = [];
  const scoutedPlayerRows = [];
  const otherRows = [];

  for (const r of rows) {
    const name = (r.name || '').trim();
    const code = teamCodeFromRowName(name);
    if (code === ctx.scoutedTeamCode) scoutedTeamRow.push(r);
    else if (code) otherTeamRows.push(r);
    else if (name.startsWith('#')) scoutedPlayerRows.push(r);
    else otherRows.push(r);
  }

  rows.length = 0;
  rows.push(...scoutedTeamRow, ...otherTeamRows, ...scoutedPlayerRows, ...otherRows);
}

export function runCleanPass(timelineData, originalFilename) {
  const tcCtx = { timelineData, originalFilename,
    detectedTeams: [], scoutedTeamCode: null, plan: [] };
  tcDetectTeams(tcCtx);
  tcAutoSelectScoutedTeam(tcCtx);
  tcBuildPlan(tcCtx);

  const cleanReport = {
    detectedTeams: tcCtx.detectedTeams.map(t => t.code),
    scoutedTeam: tcCtx.scoutedTeamCode,
    planSummary: {
      DELETE:  tcCtx.plan.filter(p => p.action === 'DELETE').length,
      RECOLOR: tcCtx.plan.filter(p => p.action === 'RECOLOR').length,
      RENAME:  tcCtx.plan.filter(p => p.action === 'RENAME').length,
      KEEP:    tcCtx.plan.filter(p => p.action === 'KEEP').length,
    }
  };

  const rows = timelineData.timeline.rows;
  const newRows = [];
  tcCtx.plan.forEach(p => {
    const r = rows[p.rowIdx];
    if (p.action === 'DELETE') return;
    if (p.action === 'RECOLOR' || p.action === 'RENAME') {
      r.color = p.newColor; r.name = p.newName;
    }
    newRows.push(r);
  });
  newRows.forEach((r, idx) => { r.rowNum = idx + 1; });
  timelineData.timeline.rows = newRows;

  tcReorderRows(timelineData.timeline.rows, tcCtx);
  timelineData.timeline.rows.forEach((r, idx) => { r.rowNum = idx + 1; });

  return { cleanReport, tcCtx };
}
