'use strict';

const zlib = require('zlib');
const path = require('path');
const protobuf = require('protobufjs');

// Load the proto schema once
let NoteStoreProto = null;

function loadProto() {
  if (NoteStoreProto) return NoteStoreProto;
  const protoPath = path.join(__dirname, '..', 'notestore.proto');
  const root = protobuf.loadSync(protoPath);
  NoteStoreProto = root.lookupType('notestore.NoteStoreProto');
  return NoteStoreProto;
}

function decompressNoteData(rawData) {
  if (rawData == null) return null;
  try {
    return zlib.gunzipSync(rawData);
  } catch (e) {
    // Some older notes might not be gzipped
    return rawData;
  }
}

function formatUuidBytes(uuidBytes) {
  if (!uuidBytes || uuidBytes.length !== 16) {
    return uuidBytes ? Buffer.from(uuidBytes).toString('hex') : null;
  }
  // Format as standard UUID string: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const hex = Buffer.from(uuidBytes).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function buildChecklists(rawRuns) {
  const checklists = [];
  let currentUuid = null;
  let currentText = '';
  let currentDone = false;

  for (const { run, runText } of rawRuns) {
    let clUuid = null;
    let clDone = false;

    const ps = run.paragraphStyle;
    if (ps && ps.checklist) {
      const cl = ps.checklist;
      clUuid = cl.uuid ? formatUuidBytes(cl.uuid) : null;
      clDone = cl.done != null ? Boolean(cl.done) : false;
    }

    if (clUuid != null) {
      if (clUuid === currentUuid) {
        currentText += runText;
      } else {
        if (currentUuid != null) {
          checklists.push({
            uuid: currentUuid,
            text: currentText.replace(/\n+$/, ''),
            done: currentDone,
          });
        }
        currentUuid = clUuid;
        currentText = runText;
        currentDone = clDone;
      }
    } else {
      if (currentUuid != null) {
        checklists.push({
          uuid: currentUuid,
          text: currentText.replace(/\n+$/, ''),
          done: currentDone,
        });
        currentUuid = null;
        currentText = '';
      }
    }
  }

  if (currentUuid != null) {
    checklists.push({
      uuid: currentUuid,
      text: currentText.replace(/\n+$/, ''),
      done: currentDone,
    });
  }

  return checklists;
}

function parseNoteProtobuf(rawData) {
  const data = decompressNoteData(rawData);
  if (data == null) {
    return { text: '', attribute_runs: [], checklists: [], attachments: [], links: [] };
  }

  const ProtoType = loadProto();
  const proto = ProtoType.decode(Buffer.isBuffer(data) ? new Uint8Array(data) : data);
  const note = proto.document && proto.document.note;
  if (!note) {
    return { text: '', attribute_runs: [], checklists: [], attachments: [], links: [] };
  }

  const text = note.noteText || '';
  const attributeRuns = [];
  const attachments = [];
  const links = [];

  // First pass: collect all runs with text positions
  const rawRuns = [];
  let pos = 0;
  for (const run of (note.attributeRun || [])) {
    const length = run.length || 0;
    const runText = pos + length <= text.length ? text.slice(pos, pos + length) : text.slice(pos);
    rawRuns.push({ run, runText, pos });
    pos += length;
  }

  // Merge consecutive checklist runs with same UUID into single items
  const checklists = buildChecklists(rawRuns);

  // Second pass: build attribute_runs and extract attachments/links
  for (const { run, runText } of rawRuns) {
    const runDict = { length: run.length || 0 };

    // Paragraph style
    if (run.paragraphStyle) {
      const ps = run.paragraphStyle;
      const style = {};
      if (ps.styleType != null && ps.styleType !== -1) {
        style.style_type = ps.styleType;
      }
      if (ps.alignment) {
        style.alignment = ps.alignment;
      }
      if (ps.indentAmount) {
        style.indent_amount = ps.indentAmount;
      }
      if (ps.blockQuote) {
        style.block_quote = ps.blockQuote;
      }

      if (ps.checklist) {
        const cl = ps.checklist;
        const checklistUuid = cl.uuid ? formatUuidBytes(cl.uuid) : null;
        const done = cl.done != null ? Boolean(cl.done) : false;
        style.checklist = { uuid: checklistUuid, done };
      }

      if (Object.keys(style).length > 0) {
        runDict.paragraph_style = style;
      }
    }

    // Font
    if (run.font) {
      const f = run.font;
      const font = {};
      if (f.fontName) font.font_name = f.fontName;
      if (f.pointSize) font.point_size = f.pointSize;
      if (Object.keys(font).length > 0) {
        runDict.font = font;
      }
    }

    // Font weight
    if (run.fontWeight) {
      runDict.font_weight = run.fontWeight;
    }

    // Underlined
    if (run.underlined) {
      runDict.underlined = true;
    }

    // Strikethrough
    if (run.strikethrough) {
      runDict.strikethrough = true;
    }

    // Superscript
    if (run.superscript) {
      runDict.superscript = run.superscript;
    }

    // Link
    if (run.link) {
      runDict.link = run.link;
      links.push({
        url: run.link,
        text: runText.replace(/\n+$/, ''),
      });
    }

    // Color
    if (run.color) {
      const c = run.color;
      runDict.color = {
        red: c.red || 0,
        green: c.green || 0,
        blue: c.blue || 0,
        alpha: c.alpha || 0,
      };
    }

    // Attachment info
    if (run.attachmentInfo) {
      const ai = run.attachmentInfo;
      const att = {};
      if (ai.attachmentIdentifier) att.attachment_identifier = ai.attachmentIdentifier;
      if (ai.typeUti) att.type_uti = ai.typeUti;
      runDict.attachment_info = att;
      attachments.push(att);
    }

    attributeRuns.push(runDict);
  }

  return {
    text,
    attribute_runs: attributeRuns,
    checklists,
    attachments,
    links,
  };
}

function noteToMarkdown(parsed) {
  const text = parsed.text;
  if (!parsed.attribute_runs || parsed.attribute_runs.length === 0) {
    return text;
  }

  const parts = [];
  let pos = 0;
  let prevChecklistUuid = null;
  let prevHeadingStyle = null;

  for (const run of parsed.attribute_runs) {
    const length = run.length || 0;
    let chunk = pos + length <= text.length ? text.slice(pos, pos + length) : text.slice(pos);
    pos += length;

    const ps = run.paragraph_style || {};

    // Checklist
    const cl = ps.checklist;
    if (cl != null) {
      if (cl.uuid !== prevChecklistUuid) {
        const prefix = cl.done ? '- [x] ' : '- [ ] ';
        chunk = prefix + chunk;
      }
      prevChecklistUuid = cl.uuid;
    } else {
      prevChecklistUuid = null;
    }

    // Heading
    const styleType = ps.style_type;
    if ((styleType === 0 || styleType === 1 || styleType === 2) && cl == null) {
      if (styleType !== prevHeadingStyle) {
        const prefixMap = { 0: '# ', 1: '## ', 2: '### ' };
        const lines = chunk.split('\n');
        chunk = prefixMap[styleType] + lines[0] + (
          lines.length > 1 ? '\n' + lines.slice(1).join('\n') : ''
        );
      }
      prevHeadingStyle = styleType;
    } else {
      if (cl == null) {
        prevHeadingStyle = null;
      }
    }

    // Bold
    if ((run.font_weight || 0) > 0) {
      const stripped = chunk.replace(/\n+$/, '');
      const trail = chunk.slice(stripped.length);
      if (stripped) {
        chunk = `**${stripped}**${trail}`;
      }
    }

    // Strikethrough
    if (run.strikethrough) {
      const stripped = chunk.replace(/\n+$/, '');
      const trail = chunk.slice(stripped.length);
      if (stripped) {
        chunk = `~~${stripped}~~${trail}`;
      }
    }

    // Link
    if (run.link) {
      const stripped = chunk.replace(/\n+$/, '');
      const trail = chunk.slice(stripped.length);
      if (stripped) {
        chunk = `[${stripped}](${run.link})${trail}`;
      }
    }

    // Attachment placeholder
    if (run.attachment_info) {
      const ai = run.attachment_info;
      const typeUti = ai.type_uti || 'unknown';
      const attId = ai.attachment_identifier || '';
      chunk = `[Attachment: ${typeUti} (${attId})]\n`;
    }

    parts.push(chunk);
  }

  return parts.join('');
}

function noteToHtml(parsed) {
  const text = parsed.text;
  if (!parsed.attribute_runs || parsed.attribute_runs.length === 0) {
    return `<p>${escapeHtml(text)}</p>`;
  }

  const parts = [];
  let pos = 0;

  for (const run of parsed.attribute_runs) {
    const length = run.length || 0;
    const chunk = pos + length <= text.length ? text.slice(pos, pos + length) : text.slice(pos);
    pos += length;

    let escaped = escapeHtml(chunk);

    // Bold
    if ((run.font_weight || 0) > 0) {
      escaped = `<b>${escaped}</b>`;
    }

    // Underline
    if (run.underlined) {
      escaped = `<u>${escaped}</u>`;
    }

    // Strikethrough
    if (run.strikethrough) {
      escaped = `<s>${escaped}</s>`;
    }

    // Link
    if (run.link) {
      escaped = `<a href="${escapeHtml(run.link)}">${escaped}</a>`;
    }

    // Checklist
    const ps = run.paragraph_style || {};
    const cl = ps.checklist;
    if (cl != null) {
      const checked = cl.done ? ' checked' : '';
      escaped = `<input type="checkbox"${checked} disabled> ${escaped}`;
    }

    parts.push(escaped);
  }

  let content = parts.join('');
  content = content.replace(/\n/g, '<br>\n');
  return content;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  parseNoteProtobuf,
  noteToMarkdown,
  noteToHtml,
};
