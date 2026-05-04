import * as zip from '@zip.js/zip.js';
import { applyAssignmentsToTimeline } from './timelineWriter.js';
import { buildFullGameSorter, buildPopulatedSorter } from './sorterBuilder.js';
import { base64ToBytes, cleanSCVideoSegment, cleanPathSegments } from './utils.js';
import { TEMPLATE_META_B64 } from './constants.js';

export async function generate(engine, onProgress) {
  const {
    assignments, timelineData, offRow, defRow,
    scoutedTeamName, opposingTeamName, gameDate, connector,
    folderInZipName, timelinePath, zipEntries, excelFile, videoInfo
  } = engine;

  const { text: newTimelineText, labelsByUniqueId, taggedInstances, rebuiltTimeline } =
    applyAssignmentsToTimeline(timelineData, assignments, scoutedTeamName, opposingTeamName, offRow);

  const writtenCount = assignments.filter(a => a.callClean && a.callClean.trim()).length;
  const fullGameClipCount = taggedInstances.length;

  const timelineUniqueId = rebuiltTimeline.timeline.uniqueId;
  const timelineDisplayName = `${gameDate || ''} - ${scoutedTeamName} ${connector} ${opposingTeamName}`.replace(/^\s*-\s*/, '');

  const fullGameSorterJson = buildFullGameSorter(
    taggedInstances, videoInfo, timelineUniqueId, timelineDisplayName
  );

  const findRow = (name) => rebuiltTimeline.timeline.rows.find(
    r => (r.name || '').trim().toUpperCase() === (name || '').toUpperCase()
  );
  const labeledOffRow = findRow(scoutedTeamName);
  const labeledDefRow = findRow(opposingTeamName);
  if (!labeledOffRow) throw new Error(`Cannot find labeled OFF row "${scoutedTeamName}" in rebuilt timeline`);
  if (!labeledDefRow) throw new Error(`Cannot find labeled DEF row "${opposingTeamName}" in rebuilt timeline`);

  const packFolderName = `${gameDate || ''} - ${scoutedTeamName} ${connector} ${opposingTeamName}`.replace(/^\s*-\s*/, '');
  const baseScVideoName = cleanSCVideoSegment(folderInZipName || 'output');
  const outputName = `${packFolderName}.zip`;

  // Try streaming save
  let outputWriter, outputHandle, usedStreaming = false;
  if ('showSaveFilePicker' in window) {
    try {
      outputHandle = await window.showSaveFilePicker({
        suggestedName: outputName,
        types: [{ description: 'Zip', accept: { 'application/zip': ['.zip'] } }]
      });
      const stream = await outputHandle.createWritable();
      outputWriter = { writable: stream };
      usedStreaming = true;
    } catch (e) {
      if (e.name === 'AbortError') return null;
      outputWriter = new zip.BlobWriter('application/zip');
    }
  } else {
    outputWriter = new zip.BlobWriter('application/zip');
  }

  const writer = new zip.ZipWriter(outputWriter, { level: 0 });

  const filesToCopy = zipEntries.filter(entry => {
    if (entry.directory) return false;
    const path = entry.filename;
    const fn = path.split('/').pop();
    if (fn.startsWith('._') || fn === '.DS_Store') return false;
    if (path.startsWith('__MACOSX/') || path.includes('/__MACOSX/')) return false;
    if (path === timelinePath) return false;
    if (/\.SCPlaylist\//i.test(path) && !path.includes(folderInZipName + '/')) return false;
    if (/\.xlsx?$/i.test(fn)) return false;
    return true;
  });

  const totalBytes = filesToCopy.reduce((sum, e) => sum + (e.uncompressedSize || 0), 0);
  let processedBytes = 0;

  for (let i = 0; i < filesToCopy.length; i++) {
    const entry = filesToCopy[i];
    const fname = entry.filename.split('/').pop();
    const sizeMB = ((entry.uncompressedSize || 0) / 1024 / 1024).toFixed(1);
    onProgress(`Copying ${fname} (${sizeMB} MB) [${i+1}/${filesToCopy.length}]...`,
      totalBytes > 0 ? processedBytes / totalBytes * 100 : 0);

    let relInsideScVideo;
    const inPath = entry.filename;
    if (inPath.startsWith(folderInZipName + '/')) {
      relInsideScVideo = inPath.slice(folderInZipName.length + 1);
    } else if (inPath === folderInZipName) {
      relInsideScVideo = fname;
    } else {
      relInsideScVideo = inPath;
    }
    const outPath = `${packFolderName}/${baseScVideoName}/${cleanPathSegments(relInsideScVideo)}`;

    let blob;
    if (entry._file) blob = entry._file;
    else blob = await entry.getData(new zip.BlobWriter());
    await writer.add(outPath, new zip.BlobReader(blob));

    processedBytes += entry.uncompressedSize || 0;
    await new Promise(r => setTimeout(r, 0));
  }

  onProgress('Writing labeled timeline...', 95);
  const tlRel = timelinePath.startsWith(folderInZipName + '/')
    ? timelinePath.slice(folderInZipName.length + 1)
    : timelinePath;
  const tlOutPath = `${packFolderName}/${baseScVideoName}/${cleanPathSegments(tlRel)}`;
  await writer.add(tlOutPath, new zip.TextReader(newTimelineText));

  onProgress(`Building OFFENSE sorter (${labeledOffRow.instances?.length || 0} clips)...`, 96);
  const offenseJson = buildPopulatedSorter({
    groupName: scoutedTeamName,
    instances: labeledOffRow.instances || [],
    timelineUniqueId,
    timelineDisplayName
  }, videoInfo);
  const offBase = `${packFolderName}/${packFolderName} OFFENSE.SCPlaylist`;
  await writer.add(`${offBase}/Playlist.SCClips`, new zip.TextReader(offenseJson));
  await writer.add(`${offBase}/package.meta`, new zip.Uint8ArrayReader(base64ToBytes(TEMPLATE_META_B64)));

  onProgress(`Building DEFENSE sorter (${labeledDefRow.instances?.length || 0} clips)...`, 97);
  const defenseJson = buildPopulatedSorter({
    groupName: opposingTeamName,
    instances: labeledDefRow.instances || [],
    timelineUniqueId,
    timelineDisplayName
  }, videoInfo);
  const defBase = `${packFolderName}/${packFolderName} DEFENSE.SCPlaylist`;
  await writer.add(`${defBase}/Playlist.SCClips`, new zip.TextReader(defenseJson));
  await writer.add(`${defBase}/package.meta`, new zip.Uint8ArrayReader(base64ToBytes(TEMPLATE_META_B64)));

  onProgress(`Writing FULL GAME sorter (${fullGameClipCount} clips)...`, 98);
  const fgBase = `${packFolderName}/${packFolderName} FULL GAME.SCPlaylist`;
  await writer.add(`${fgBase}/Playlist.SCClips`, new zip.TextReader(fullGameSorterJson));
  await writer.add(`${fgBase}/package.meta`, new zip.Uint8ArrayReader(base64ToBytes(TEMPLATE_META_B64)));

  onProgress('Adding Excel...', 99);
  if (excelFile) {
    await writer.add(`${packFolderName}/${excelFile.name}`, new zip.BlobReader(excelFile));
  }

  onProgress('Finalizing...', 99.5);

  if (usedStreaming) {
    await writer.close();
    return { kind: 'streamed', outputName, writtenCount, fullGameClipCount, assignments };
  } else {
    const blob = await writer.close();
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
    const url = URL.createObjectURL(blob);
    return { kind: 'blob', outputName, url, sizeMB, writtenCount, fullGameClipCount, assignments };
  }
}
