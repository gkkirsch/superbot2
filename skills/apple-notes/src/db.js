'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Apple Notes database location
const DB_PATH = path.join(
  os.homedir(),
  'Library/Group Containers/group.com.apple.notes/NoteStore.sqlite'
);

// Core Data epoch offset: seconds between Unix epoch (1970-01-01) and Core Data epoch (2001-01-01)
const CORE_DATA_EPOCH_OFFSET = 978307200;

// Media files base path
const MEDIA_BASE = path.join(
  os.homedir(),
  'Library/Group Containers/group.com.apple.notes/Accounts'
);

// UUID pattern for auto-detection
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function getConnection() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Notes database not found: ${DB_PATH}`);
  }
  const db = new Database(DB_PATH, { readonly: true });
  return db;
}

function convertTimestamp(coreDataTs) {
  if (coreDataTs == null || coreDataTs === 0) {
    return null;
  }
  const unixMs = (coreDataTs + CORE_DATA_EPOCH_OFFSET) * 1000;
  return new Date(unixMs).toISOString();
}

function resolveNoteId(db, noteIdStr) {
  // Try integer first
  const zpk = parseInt(noteIdStr, 10);
  if (!isNaN(zpk) && String(zpk) === noteIdStr) {
    const row = db.prepare(
      "SELECT Z_PK FROM ZICCLOUDSYNCINGOBJECT WHERE Z_PK = ? AND ZTITLE1 IS NOT NULL"
    ).get(zpk);
    if (row) return row.Z_PK;
  }

  // Try UUID
  if (UUID_PATTERN.test(noteIdStr)) {
    const row = db.prepare(
      "SELECT Z_PK FROM ZICCLOUDSYNCINGOBJECT WHERE ZIDENTIFIER = ? AND ZTITLE1 IS NOT NULL"
    ).get(noteIdStr);
    if (row) return row.Z_PK;
  }

  throw new Error(`Note not found: ${noteIdStr}`);
}

function getDeletedFolderPk(db) {
  const row = db.prepare(
    "SELECT Z_PK FROM ZICCLOUDSYNCINGOBJECT WHERE ZTITLE2 = 'Recently Deleted'"
  ).get();
  return row ? row.Z_PK : null;
}

function getFolderName(db, folderPk) {
  if (folderPk == null) return null;
  const row = db.prepare(
    "SELECT ZTITLE2 FROM ZICCLOUDSYNCINGOBJECT WHERE Z_PK = ?"
  ).get(folderPk);
  return row ? row.ZTITLE2 : null;
}

function getFolderPk(db, folderName) {
  const row = db.prepare(
    "SELECT Z_PK FROM ZICCLOUDSYNCINGOBJECT WHERE LOWER(ZTITLE2) = LOWER(?)"
  ).get(folderName);
  if (row) return row.Z_PK;
  throw new Error(`Folder not found: ${folderName}`);
}

function buildNotesQuery({ folder, pinned, includeDeleted, search } = {}) {
  let sql = `
    SELECT n.Z_PK, n.ZTITLE1, n.ZFOLDER, n.ZMODIFICATIONDATE1,
           n.ZHASCHECKLIST, n.ZISPINNED, n.ZIDENTIFIER, n.ZSNIPPET,
           f.ZTITLE2 as folder_name
    FROM ZICCLOUDSYNCINGOBJECT n
    LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON n.ZFOLDER = f.Z_PK
    WHERE n.ZTITLE1 IS NOT NULL
  `;
  const params = [];

  if (!includeDeleted) {
    sql += " AND n.ZMARKEDFORDELETION = 0";
    sql += " AND (f.ZTITLE2 IS NULL OR f.ZTITLE2 != 'Recently Deleted')";
  }

  if (folder) {
    sql += " AND LOWER(f.ZTITLE2) = LOWER(?)";
    params.push(folder);
  }

  if (pinned) {
    sql += " AND n.ZISPINNED = 1";
  }

  if (search) {
    sql += " AND (n.ZTITLE1 LIKE ? OR n.ZSNIPPET LIKE ?)";
    const pattern = `%${search}%`;
    params.push(pattern, pattern);
  }

  sql += " ORDER BY n.ZMODIFICATIONDATE1 DESC";

  return { sql, params };
}

function getNoteData(db, notePk) {
  const row = db.prepare(
    "SELECT ZDATA FROM ZICNOTEDATA WHERE ZNOTE = ?"
  ).get(notePk);
  if (row && row.ZDATA) return row.ZDATA;
  return null;
}

function getNoteMetadata(db, notePk) {
  const row = db.prepare(
    `SELECT n.Z_PK, n.ZTITLE1, n.ZFOLDER, n.ZMODIFICATIONDATE1,
            n.ZHASCHECKLIST, n.ZISPINNED, n.ZIDENTIFIER, n.ZSNIPPET,
            f.ZTITLE2 as folder_name
     FROM ZICCLOUDSYNCINGOBJECT n
     LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON n.ZFOLDER = f.Z_PK
     WHERE n.Z_PK = ?`
  ).get(notePk);
  if (!row) throw new Error(`Note not found: ${notePk}`);
  return row;
}

function getAttachments(db, notePk) {
  return db.prepare(
    `SELECT a.Z_PK, a.ZTYPEUTI, a.ZIDENTIFIER, a.ZTITLE, a.ZFALLBACKTITLE,
            a.ZMEDIA, m.ZIDENTIFIER as media_identifier, m.ZFILENAME
     FROM ZICCLOUDSYNCINGOBJECT a
     LEFT JOIN ZICCLOUDSYNCINGOBJECT m ON a.ZMEDIA = m.Z_PK
     WHERE a.ZNOTE = ? AND a.ZTYPEUTI IS NOT NULL`
  ).all(notePk);
}

function getAttachmentById(db, attachmentId) {
  const row = db.prepare(
    `SELECT a.Z_PK, a.ZTYPEUTI, a.ZIDENTIFIER, a.ZTITLE, a.ZFALLBACKTITLE,
            a.ZNOTE, a.ZMEDIA, m.ZIDENTIFIER as media_identifier, m.ZFILENAME
     FROM ZICCLOUDSYNCINGOBJECT a
     LEFT JOIN ZICCLOUDSYNCINGOBJECT m ON a.ZMEDIA = m.Z_PK
     WHERE a.ZIDENTIFIER = ? AND a.ZTYPEUTI IS NOT NULL`
  ).get(attachmentId);
  if (!row) throw new Error(`Attachment not found: ${attachmentId}`);
  return row;
}

function findMediaPath(mediaIdentifier) {
  if (!mediaIdentifier) return null;
  if (!fs.existsSync(MEDIA_BASE)) return null;

  const accountDirs = fs.readdirSync(MEDIA_BASE);
  for (const accountDir of accountDirs) {
    const mediaDir = path.join(MEDIA_BASE, accountDir, 'Media', mediaIdentifier);
    if (fs.existsSync(mediaDir) && fs.statSync(mediaDir).isDirectory()) {
      const subs = fs.readdirSync(mediaDir);
      for (const sub of subs) {
        const subPath = path.join(mediaDir, sub);
        if (fs.statSync(subPath).isDirectory()) {
          const files = fs.readdirSync(subPath).filter(f => !f.startsWith('.'));
          if (files.length > 0) {
            return path.join(subPath, files[0]);
          }
        } else if (!sub.startsWith('.')) {
          return subPath;
        }
      }
    }
  }
  return null;
}

function getFolders(db) {
  return db.prepare(
    `SELECT f.Z_PK, f.ZTITLE2, f.ZISHIDDENNOTECONTAINER,
            COUNT(n.Z_PK) as note_count
     FROM ZICCLOUDSYNCINGOBJECT f
     LEFT JOIN ZICCLOUDSYNCINGOBJECT n ON n.ZFOLDER = f.Z_PK AND n.ZTITLE1 IS NOT NULL AND n.ZMARKEDFORDELETION = 0
     WHERE f.ZTITLE2 IS NOT NULL
     GROUP BY f.Z_PK
     ORDER BY f.ZTITLE2`
  ).all();
}

module.exports = {
  getConnection,
  convertTimestamp,
  resolveNoteId,
  getDeletedFolderPk,
  getFolderName,
  getFolderPk,
  buildNotesQuery,
  getNoteData,
  getNoteMetadata,
  getAttachments,
  getAttachmentById,
  findMediaPath,
  getFolders,
};
