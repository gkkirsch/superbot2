'use strict';

const path = require('path');
const fs = require('fs');

const {
  getConnection, resolveNoteId, getAttachments,
  getAttachmentById, findMediaPath, getNoteData,
} = require('./db');
const { parseNoteProtobuf } = require('./proto-parser');

function cmdAttachments(noteIdStr) {
  const db = getConnection();
  try {
    const notePk = resolveNoteId(db, noteIdStr);
    const attachments = getAttachments(db, notePk);

    return attachments.map(att => {
      const mediaId = att.media_identifier;
      const mediaPath = mediaId ? findMediaPath(mediaId) : null;
      return {
        id: att.Z_PK,
        identifier: att.ZIDENTIFIER,
        type: att.ZTYPEUTI,
        title: att.ZTITLE || att.ZFALLBACKTITLE,
        filename: att.ZFILENAME || null,
        file_path: mediaPath,
      };
    });
  } finally {
    db.close();
  }
}

function cmdExtract(attachmentId, { output } = {}) {
  const db = getConnection();
  try {
    const att = getAttachmentById(db, attachmentId);
    const mediaId = att.media_identifier;
    const mediaPath = mediaId ? findMediaPath(mediaId) : null;

    if (mediaPath == null) {
      throw new Error(
        `Media file not found for attachment ${attachmentId}. ` +
        `Type: ${att.ZTYPEUTI} - this may be a non-file attachment ` +
        `(table, gallery, drawing).`
      );
    }

    const destPath = output || path.basename(mediaPath);
    fs.copyFileSync(mediaPath, destPath);

    // Preserve timestamps
    const stat = fs.statSync(mediaPath);
    fs.utimesSync(destPath, stat.atime, stat.mtime);

    return {
      extracted: true,
      source: mediaPath,
      destination: path.resolve(destPath),
      type: att.ZTYPEUTI,
      size: fs.statSync(destPath).size,
    };
  } finally {
    db.close();
  }
}

function cmdChecklists(noteIdStr) {
  const db = getConnection();
  try {
    const notePk = resolveNoteId(db, noteIdStr);
    const rawData = getNoteData(db, notePk);
    const parsed = parseNoteProtobuf(rawData);
    return parsed.checklists;
  } finally {
    db.close();
  }
}

module.exports = { cmdAttachments, cmdExtract, cmdChecklists };
