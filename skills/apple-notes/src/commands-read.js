'use strict';

const {
  getConnection, resolveNoteId, convertTimestamp,
  buildNotesQuery, getNoteData, getNoteMetadata, getFolders,
} = require('./db');
const { parseNoteProtobuf, noteToMarkdown, noteToHtml } = require('./proto-parser');

function formatNoteRow(row) {
  return {
    id: row.Z_PK,
    uuid: row.ZIDENTIFIER,
    title: row.ZTITLE1,
    folder: row.folder_name,
    modified: convertTimestamp(row.ZMODIFICATIONDATE1),
    has_checklist: Boolean(row.ZHASCHECKLIST),
    pinned: Boolean(row.ZISPINNED),
    snippet: row.ZSNIPPET,
  };
}

function humanTable(notes) {
  if (!notes.length) return 'No notes found.';

  const idW = Math.max(...notes.map(n => String(n.id).length));
  const titleW = Math.min(50, Math.max(...notes.map(n => (n.title || '').length)));
  const folderW = Math.min(20, Math.max(...notes.map(n => (n.folder || '').length)));

  const header = `${'ID'.padEnd(idW)}  ${'Title'.padEnd(titleW)}  ${'Folder'.padEnd(folderW)}  ${'Modified'.padEnd(20)}  Flags`;
  const sep = '-'.repeat(header.length);
  const lines = [header, sep];

  for (const n of notes) {
    const title = (n.title || '').slice(0, titleW).padEnd(titleW);
    const folder = (n.folder || '').slice(0, folderW).padEnd(folderW);
    const modified = (n.modified || '').slice(0, 19).padEnd(20);
    const flags = [];
    if (n.pinned) flags.push('pinned');
    if (n.has_checklist) flags.push('checklist');
    lines.push(`${String(n.id).padEnd(idW)}  ${title}  ${folder}  ${modified}  ${flags.join(', ')}`);
  }

  return lines.join('\n');
}

function cmdList({ folder, limit, pinned, includeDeleted, human } = {}) {
  const db = getConnection();
  try {
    let { sql, params } = buildNotesQuery({
      folder, pinned, includeDeleted,
    });
    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }
    const rows = db.prepare(sql).all(...params);
    const notes = rows.map(formatNoteRow);

    if (human) return humanTable(notes);
    return notes;
  } finally {
    db.close();
  }
}

function cmdRead(noteIdStr, fmt = 'json') {
  const db = getConnection();
  try {
    const notePk = resolveNoteId(db, noteIdStr);
    const metadata = getNoteMetadata(db, notePk);
    const rawData = getNoteData(db, notePk);
    const parsed = parseNoteProtobuf(rawData);

    if (fmt === 'text') return parsed.text;
    if (fmt === 'markdown') return noteToMarkdown(parsed);
    if (fmt === 'html') return noteToHtml(parsed);

    // json
    return {
      id: metadata.Z_PK,
      uuid: metadata.ZIDENTIFIER,
      title: metadata.ZTITLE1,
      folder: metadata.folder_name,
      modified: convertTimestamp(metadata.ZMODIFICATIONDATE1),
      has_checklist: Boolean(metadata.ZHASCHECKLIST),
      pinned: Boolean(metadata.ZISPINNED),
      text: parsed.text,
      attribute_runs: parsed.attribute_runs,
      checklists: parsed.checklists,
      attachments: parsed.attachments,
      links: parsed.links,
    };
  } finally {
    db.close();
  }
}

function cmdSearch(query, { folder, includeDeleted } = {}) {
  const db = getConnection();
  try {
    const { sql, params } = buildNotesQuery({
      folder, includeDeleted, search: query,
    });
    const rows = db.prepare(sql).all(...params);
    return rows.map(formatNoteRow);
  } finally {
    db.close();
  }
}

function cmdFolders() {
  const db = getConnection();
  try {
    const folders = getFolders(db);
    return folders.map(f => ({
      id: f.Z_PK,
      name: f.ZTITLE2,
      note_count: f.note_count,
      hidden: Boolean(f.ZISHIDDENNOTECONTAINER),
    }));
  } finally {
    db.close();
  }
}

module.exports = { cmdList, cmdRead, cmdSearch, cmdFolders };
