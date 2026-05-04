import * as zip from '@zip.js/zip.js';
import { runCleanPass } from './teamClean.js';
import { teamCodeFromRowName } from './teamClean.js';

async function walkDir(dirEntry, basePath, accumulator, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = dirEntry.createReader();
    const allEntries = [];
    function readBatch() {
      reader.readEntries(async (entries) => {
        try {
          if (entries.length === 0) {
            const subdirs = [];
            const filePromises = [];
            for (const entry of allEntries) {
              const path = basePath ? `${basePath}/${entry.name}` : entry.name;
              if (entry.isFile) {
                filePromises.push(
                  new Promise((res, rej) => entry.file(res, rej))
                    .then(file => {
                      accumulator.push({ path, file });
                      if (onProgress) onProgress(accumulator.length);
                    })
                );
              } else if (entry.isDirectory) {
                subdirs.push({ entry, path });
              }
            }
            await Promise.all(filePromises);
            await new Promise(r => setTimeout(r, 0));
            for (const sd of subdirs) {
              await walkDir(sd.entry, sd.path, accumulator, onProgress);
            }
            resolve();
          } else {
            allEntries.push(...entries);
            readBatch();
          }
        } catch (e) { reject(e); }
      }, reject);
    }
    readBatch();
  });
}

async function processEntries(zipEntries, droppedName, folderInZipName) {
  let timelineEntry = null;
  let timelinePath = '';
  let videoJsonEntry = null;

  for (const entry of zipEntries) {
    const path = entry.filename;
    const fn = path.split('/').pop();
    if (fn.startsWith('._') || fn === '.DS_Store') continue;
    if (path.startsWith('__MACOSX/') || path.includes('/__MACOSX/')) continue;
    if (path.toLowerCase().endsWith('.sctimeline')) {
      timelineEntry = entry;
      timelinePath = path;
    }
    if (fn.toLowerCase() === 'video.json') {
      videoJsonEntry = entry;
    }
  }

  if (!timelineEntry) throw new Error('No .SCTimeline file found');
  if (!videoJsonEntry) throw new Error('No video.json found inside the .SCVideo');

  const parts = timelinePath.split('/');
  const finalFolderInZipName = folderInZipName || parts[0];

  const scVideoRe = /\.scvideo(\s.*)?$/i;
  let scVideoIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (scVideoRe.test(parts[i])) { scVideoIdx = i; break; }
  }
  if (scVideoIdx < 0) throw new Error(`Could not locate .SCVideo folder in path: ${timelinePath}`);
  const scVideoRelPath = parts.slice(0, scVideoIdx + 1).join('/');

  const timelineText = timelineEntry._file
    ? await timelineEntry._file.text()
    : await timelineEntry.getData(new zip.TextWriter());
  const timelineData = JSON.parse(timelineText);
  if (!timelineData.timeline || !Array.isArray(timelineData.timeline.rows)) {
    throw new Error('Timeline JSON is invalid');
  }

  const videoJsonText = videoJsonEntry._file
    ? await videoJsonEntry._file.text()
    : await videoJsonEntry.getData(new zip.TextWriter());
  const vj = JSON.parse(videoJsonText);
  if (!vj.id || !vj.streams) throw new Error('video.json missing id/streams');
  const videoInfo = { id: vj.id, streams: vj.streams, path: vj.path };

  // Run the timeline clean pass
  const { cleanReport } = runCleanPass(timelineData, finalFolderInZipName || droppedName);

  const rows = timelineData.timeline.rows;
  const teamRows = rows.filter(r => {
    const code = teamCodeFromRowName(r.name);
    return code && (r.instances || []).length > 0;
  });
  if (teamRows.length < 2) {
    throw new Error(`Need 2 team rows with instances; found ${teamRows.length}`);
  }

  const offRow = teamRows[0];
  const defRow = teamRows[1];
  const scoutedTeamName = (offRow.name || '').trim().toUpperCase();
  const opposingTeamName = (defRow.name || '').trim().toUpperCase();

  const nameForParse = finalFolderInZipName || droppedName;
  let gameDate = '';
  const dateMatch = nameForParse.match(/(20)?(\d{2})[-._](\d{2})[-._](\d{2})/);
  if (dateMatch) gameDate = `${dateMatch[2]}.${dateMatch[3]}.${dateMatch[4]}`;

  const upper = nameForParse.toUpperCase();
  let connector = '@';
  if (upper.match(new RegExp(`${scoutedTeamName}\\s*@\\s*${opposingTeamName}`)) ||
      upper.match(new RegExp(`${opposingTeamName}\\s*@\\s*${scoutedTeamName}`))) {
    connector = '@';
  } else {
    connector = 'VS';
  }

  return {
    timelineEntry, timelinePath, timelineData,
    folderInZipName: finalFolderInZipName, scVideoRelPath,
    offRow, defRow, videoInfo,
    scoutedTeamName, opposingTeamName, gameDate, connector,
    cleanReport,
    displayName: `${scoutedTeamName} ${connector} ${opposingTeamName}`,
    offClipCount: offRow.instances.length,
  };
}

export async function handleZip(file, onFolderProgress) {
  const reader = new zip.ZipReader(new zip.BlobReader(file));
  const entries = await reader.getEntries();
  const name = file.name.replace(/\.zip$/i, '');
  const result = await processEntries(entries, name, '');
  return { zipEntries: entries, zipReader: reader, zipFile: file, ...result };
}

export async function handleFolder(rootEntry, onFolderProgress) {
  const allFiles = [];
  let lastUpdate = 0;
  await walkDir(rootEntry, rootEntry.name, allFiles, (n) => {
    const now = performance.now();
    if (now - lastUpdate > 100) {
      if (onFolderProgress) onFolderProgress(n);
      lastUpdate = now;
    }
  });

  const zipEntries = allFiles.map(f => ({
    filename: f.path,
    directory: false,
    uncompressedSize: f.file.size,
    _file: f.file,
    getData: async (writer) => {
      if (writer instanceof zip.TextWriter) return await f.file.text();
      if (writer instanceof zip.BlobWriter) return f.file;
      const buf = await f.file.arrayBuffer();
      return new Uint8Array(buf);
    }
  }));

  const result = await processEntries(zipEntries, rootEntry.name, rootEntry.name);
  return { zipEntries, zipReader: { isFolderMode: true }, zipFile: null, ...result };
}
