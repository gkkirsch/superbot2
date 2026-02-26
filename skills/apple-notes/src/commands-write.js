'use strict';

const { execSync } = require('child_process');
const { getConnection, resolveNoteId, getNoteMetadata } = require('./db');

function runApplescript(script) {
  try {
    const result = execSync(`osascript -e ${escapeShellArg(script)}`, {
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.trim() : err.message;
    throw new Error(`AppleScript error: ${stderr}`);
  }
}

function escapeShellArg(s) {
  // Wrap in single quotes and escape any embedded single quotes
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function escapeApplescriptString(s) {
  s = s.replace(/\\/g, '\\\\');
  s = s.replace(/"/g, '\\"');
  return s;
}

function markdownToHtml(text) {
  const lines = text.split('\n');
  const htmlLines = [];

  for (const line of lines) {
    if (line.startsWith('### ')) {
      htmlLines.push(`<h3>${line.slice(4)}</h3>`);
    } else if (line.startsWith('## ')) {
      htmlLines.push(`<h2>${line.slice(3)}</h2>`);
    } else if (line.startsWith('# ')) {
      htmlLines.push(`<h1>${line.slice(2)}</h1>`);
    } else if (line.startsWith('- [x] ') || line.startsWith('- [X] ')) {
      htmlLines.push(`<ul><li style="list-style-type: none;"><input type="checkbox" checked>${line.slice(6)}</li></ul>`);
    } else if (line.startsWith('- [ ] ')) {
      htmlLines.push(`<ul><li style="list-style-type: none;"><input type="checkbox">${line.slice(6)}</li></ul>`);
    } else if (line.startsWith('- ')) {
      htmlLines.push(`<ul><li>${line.slice(2)}</li></ul>`);
    } else if (line.includes('**')) {
      const converted = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      htmlLines.push(converted + '<br>');
    } else if (!line.trim()) {
      htmlLines.push('<br>');
    } else {
      htmlLines.push(line + '<br>');
    }
  }

  return htmlLines.join('\n');
}

function textToHtml(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return escaped.replace(/\n/g, '<br>\n');
}

function prepareBodyHtml(body, bodyFormat) {
  if (bodyFormat === 'html') return body;
  if (bodyFormat === 'markdown') return markdownToHtml(body);
  return textToHtml(body);
}

function cmdCreate({ folder, title, body, bodyFormat = 'text' }) {
  const bodyHtml = prepareBodyHtml(body, bodyFormat);
  const fullHtml = `<h1>${escapeApplescriptString(title)}</h1>${bodyHtml}`;
  const escapedHtml = escapeApplescriptString(fullHtml);
  const escapedFolder = escapeApplescriptString(folder);

  const script = `
    tell application "Notes"
      set theFolder to folder "${escapedFolder}" of default account
      set theNote to make new note at theFolder with properties {body:"${escapedHtml}"}
      return id of theNote
    end tell
  `;

  const noteId = runApplescript(script);

  return {
    created: true,
    title,
    folder,
    applescript_id: noteId,
  };
}

function cmdAppend(noteIdStr, { body, bodyFormat = 'text' }) {
  const db = getConnection();
  let noteTitle, folderName, notePk;
  try {
    notePk = resolveNoteId(db, noteIdStr);
    const metadata = getNoteMetadata(db, notePk);
    noteTitle = metadata.ZTITLE1;
    folderName = metadata.folder_name;
  } finally {
    db.close();
  }

  const bodyHtml = prepareBodyHtml(body, bodyFormat);
  const escapedTitle = escapeApplescriptString(noteTitle);
  const escapedFolder = escapeApplescriptString(folderName);
  const escapedHtml = escapeApplescriptString(bodyHtml);

  const script = `
    tell application "Notes"
      set theFolder to folder "${escapedFolder}" of default account
      set theNote to first note of theFolder whose name is "${escapedTitle}"
      set currentBody to body of theNote
      set body of theNote to currentBody & "${escapedHtml}"
      return name of theNote
    end tell
  `;

  runApplescript(script);

  return {
    appended: true,
    title: noteTitle,
    id: notePk,
  };
}

function cmdMove(noteIdStr, { folder }) {
  const db = getConnection();
  let noteTitle, sourceFolder, notePk;
  try {
    notePk = resolveNoteId(db, noteIdStr);
    const metadata = getNoteMetadata(db, notePk);
    noteTitle = metadata.ZTITLE1;
    sourceFolder = metadata.folder_name;
  } finally {
    db.close();
  }

  const escapedTitle = escapeApplescriptString(noteTitle);
  const escapedSource = escapeApplescriptString(sourceFolder);
  const escapedDest = escapeApplescriptString(folder);

  const script = `
    tell application "Notes"
      set sourceFolder to folder "${escapedSource}" of default account
      set destFolder to folder "${escapedDest}" of default account
      set theNote to first note of sourceFolder whose name is "${escapedTitle}"
      move theNote to destFolder
      return name of theNote
    end tell
  `;

  runApplescript(script);

  return {
    moved: true,
    title: noteTitle,
    from_folder: sourceFolder,
    to_folder: folder,
  };
}

function cmdDelete(noteIdStr) {
  const db = getConnection();
  let noteTitle, folderName, notePk;
  try {
    notePk = resolveNoteId(db, noteIdStr);
    const metadata = getNoteMetadata(db, notePk);
    noteTitle = metadata.ZTITLE1;
    folderName = metadata.folder_name;
  } finally {
    db.close();
  }

  const escapedTitle = escapeApplescriptString(noteTitle);
  const escapedFolder = escapeApplescriptString(folderName);

  const script = `
    tell application "Notes"
      set theFolder to folder "${escapedFolder}" of default account
      set theNote to first note of theFolder whose name is "${escapedTitle}"
      delete theNote
      return "deleted"
    end tell
  `;

  runApplescript(script);

  return {
    deleted: true,
    title: noteTitle,
    id: notePk,
  };
}

module.exports = { cmdCreate, cmdAppend, cmdMove, cmdDelete };
