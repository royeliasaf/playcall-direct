import { TEMPLATE_CLIPS_B64 } from './constants.js';
import { uuid, base64ToBytes } from './utils.js';

export function buildMergedClipList(offRow, defRow) {
  const tagged = [];
  const offTeamName = (offRow.name || '').trim();
  const defTeamName = (defRow.name || '').trim();

  (offRow.instances || []).forEach((inst, i) => {
    tagged.push({ ...inst, __teamName: offTeamName, __origOrder: i });
  });
  const offCount = (offRow.instances || []).length;
  (defRow.instances || []).forEach((inst, i) => {
    tagged.push({ ...inst, __teamName: defTeamName, __origOrder: offCount + i });
  });

  tagged.sort((a, b) => {
    const at = (typeof a.startTime === 'number') ? a.startTime : Number(a.startTime) || 0;
    const bt = (typeof b.startTime === 'number') ? b.startTime : Number(b.startTime) || 0;
    const dt = at - bt;
    if (dt !== 0) return dt;
    return a.__origOrder - b.__origOrder;
  });

  return tagged;
}

export function buildFullGameRowInstances(taggedInstances) {
  const cleaned = taggedInstances.map(inst => {
    const { __teamName, __origOrder, ...cleanInst } = inst;
    return cleanInst;
  });
  cleaned.sort((a, b) => {
    const at = (typeof a.startTime === 'number') ? a.startTime : Number(a.startTime) || 0;
    const bt = (typeof b.startTime === 'number') ? b.startTime : Number(b.startTime) || 0;
    return at - bt;
  });
  return cleaned.map((cleanInst, i) => ({
    ...cleanInst,
    uniqueId: uuid(),
    instanceNum: i + 1
  }));
}

export function buildFullGameSorter(taggedInstances, videoInfo, timelineUniqueId, timelineDisplayName) {
  const templateJson = new TextDecoder().decode(base64ToBytes(TEMPLATE_CLIPS_B64));
  const sorter = JSON.parse(templateJson);
  sorter.playlist.videos = [{ streams: videoInfo.streams, path: videoInfo.path, id: videoInfo.id }];
  sorter.playlist.uniqueId = uuid();
  sorter.playlist.clips = [];
  sorter.playlist.groups = [];

  const streamIds = videoInfo.streams.map(s => s.id);
  const stOf = (inst) => (typeof inst.startTime === 'number') ? inst.startTime : Number(inst.startTime) || 0;
  const sorted = taggedInstances.slice().sort((a, b) => stOf(a) - stOf(b));

  let originalIndex = 1;
  for (const inst of sorted) {
    const clipId = uuid();
    const tags = (inst.labels || []).map(l => ({ key: l.group, value: l.name }));
    const sourceId = String(inst.uniqueId || inst.instanceNum || originalIndex);
    sorter.playlist.clips.push({
      videoId: videoInfo.id,
      audioStreamIds: [...streamIds],
      tracks: [{ id: uuid(), effectIds: [] }],
      originalGroupName: inst.__teamName,
      uploadedStartTime: -1,
      uploadedStreamIds: [],
      id: clipId,
      description: '',
      startTime: inst.startTime,
      endTime: inst.endTime,
      startTimeOffset: 0,
      timelineName: timelineDisplayName,
      modifyCount: 1,
      originalIndex: originalIndex++,
      moment: {
        id: sourceId,
        endTime: inst.endTime,
        startTime: inst.startTime,
        note: inst.notes || '',
        tags,
        source: { contextId: timelineUniqueId, id: sourceId, type: 'timeline' }
      },
      streamIds: [...streamIds]
    });
    sorter.playlist.groups.push({
      id: uuid(),
      name: inst.__teamName,
      titleClipId: '',
      modifyCount: 1,
      color: '#FFFFFF',
      clipIds: [clipId]
    });
  }

  return JSON.stringify(sorter).replace(/\//g, '\\/');
}

export function buildPopulatedSorter(spec, videoInfo) {
  const templateJson = new TextDecoder().decode(base64ToBytes(TEMPLATE_CLIPS_B64));
  const sorter = JSON.parse(templateJson);
  sorter.playlist.videos = [{ streams: videoInfo.streams, path: videoInfo.path, id: videoInfo.id }];
  sorter.playlist.uniqueId = uuid();
  sorter.playlist.clips = [];
  sorter.playlist.groups = [];

  const sortedInstances = [...spec.instances].sort((a, b) => a.startTime - b.startTime);
  const streamIds = videoInfo.streams.map(s => s.id);
  const newClipIds = [];
  let originalIndex = 1;

  for (const inst of sortedInstances) {
    const clipId = uuid();
    newClipIds.push(clipId);
    const tags = (inst.labels || []).map(l => ({ key: l.group, value: l.name }));
    const sourceId = String(inst.uniqueId || inst.instanceNum || originalIndex);
    sorter.playlist.clips.push({
      videoId: videoInfo.id,
      audioStreamIds: [...streamIds],
      tracks: [{ id: uuid(), effectIds: [] }],
      originalGroupName: spec.groupName,
      uploadedStartTime: -1,
      uploadedStreamIds: [],
      id: clipId,
      description: '',
      startTime: inst.startTime,
      endTime: inst.endTime,
      startTimeOffset: 0,
      timelineName: spec.timelineDisplayName,
      modifyCount: 1,
      originalIndex: originalIndex++,
      moment: {
        id: sourceId,
        endTime: inst.endTime,
        startTime: inst.startTime,
        note: inst.notes || '',
        tags,
        source: { contextId: spec.timelineUniqueId, id: sourceId, type: 'timeline' }
      },
      streamIds: [...streamIds]
    });
  }
  sorter.playlist.groups.push({
    id: uuid(), name: spec.groupName, titleClipId: '', modifyCount: 1, color: '#FFFFFF', clipIds: newClipIds
  });
  return JSON.stringify(sorter).replace(/\//g, '\\/');
}

export function rebuildTimeline(taggedInstances, baseTimelineObj, offRowRef) {
  const out = JSON.parse(JSON.stringify(baseTimelineObj));
  const rows = out.timeline.rows;
  const newRows = [];
  for (const r of rows) {
    const upper = (r.name || '').trim().toUpperCase();
    if (upper === 'SLIDE' || upper === 'FULL GAME') continue;
    newRows.push(r);
  }
  const fullGameInstances = buildFullGameRowInstances(taggedInstances);
  const fullGameRow = {
    name: 'FULL GAME',
    color: '#FFFFFF',
    instances: fullGameInstances
  };
  if (offRowRef && offRowRef.id) fullGameRow.id = uuid();
  newRows.unshift(fullGameRow);
  newRows.forEach((r, i) => { r.rowNum = i + 1; });
  out.timeline.rows = newRows;
  return out;
}
