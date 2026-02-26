#!/usr/bin/env python3
"""Apple Notes CLI — read via SQLite, write via AppleScript."""

import datetime
import gzip
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile

import click

# CoreData epoch offset (seconds between 1970-01-01 and 2001-01-01)
COREDATA_EPOCH = 978307200

DB_PATH = os.path.expanduser(
    "~/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite"
)


def error_exit(msg, code=1):
    """Print JSON error to stderr and exit."""
    print(json.dumps({"error": msg}), file=sys.stderr)
    sys.exit(code)


def get_db():
    """Open the NoteStore database in read-only mode."""
    if not os.path.exists(DB_PATH):
        error_exit(f"Database not found: {DB_PATH}")
    try:
        conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.Error as e:
        error_exit(f"Cannot open database: {e}")


def coredata_to_iso(ts):
    """Convert CoreData timestamp to ISO 8601 string."""
    if ts is None:
        return None
    try:
        dt = datetime.datetime.fromtimestamp(ts + COREDATA_EPOCH, tz=datetime.timezone.utc)
        return dt.isoformat()
    except (OSError, ValueError):
        return None


def extract_text_from_protobuf(data):
    """Extract readable text from a gzipped protobuf blob.

    The note body is stored as a gzipped protobuf. We decompress it and then
    extract UTF-8 strings using a simple protobuf wire-format scanner:
    look for length-delimited fields (wire type 2) and collect printable strings.
    """
    if data is None:
        return ""
    try:
        decompressed = gzip.decompress(data)
    except Exception:
        return ""

    # Simple approach: scan for length-prefixed UTF-8 strings in protobuf wire format.
    # Protobuf wire type 2 (length-delimited) has tag byte where low 3 bits = 2.
    # We look for readable text runs.
    texts = []
    i = 0
    buf = decompressed
    while i < len(buf):
        # Read varint tag
        tag_byte = buf[i]
        wire_type = tag_byte & 0x07
        field_number = tag_byte >> 3

        if wire_type == 2 and i + 1 < len(buf):
            # Length-delimited field — read varint length
            i += 1
            length = 0
            shift = 0
            while i < len(buf):
                b = buf[i]
                length |= (b & 0x7F) << shift
                shift += 7
                i += 1
                if not (b & 0x80):
                    break

            if 0 < length <= len(buf) - i:
                chunk = buf[i : i + length]
                try:
                    text = chunk.decode("utf-8")
                    # Only keep chunks that look like real text (has letters/digits)
                    if len(text) > 0 and any(c.isprintable() and not c.isspace() for c in text):
                        # Filter out binary-looking strings
                        printable_ratio = sum(1 for c in text if c.isprintable()) / len(text)
                        if printable_ratio > 0.8:
                            texts.append(text)
                except UnicodeDecodeError:
                    pass
                i += length
            else:
                i += 1
        else:
            i += 1

    # The first significant text chunk is usually the note body
    # Join with newlines, skip tiny fragments
    result_parts = [t for t in texts if len(t) > 1]
    return "\n".join(result_parts) if result_parts else ""


def is_uuid(identifier):
    """Check if a string looks like a UUID."""
    return bool(re.match(r"^[0-9a-fA-F-]{8,}$", str(identifier)) and "-" in str(identifier))


def resolve_note_id(db, identifier):
    """Resolve a note identifier (Z_PK int or UUID string) to Z_PK."""
    if is_uuid(str(identifier)):
        row = db.execute(
            "SELECT Z_PK FROM ZICCLOUDSYNCINGOBJECT WHERE ZIDENTIFIER = ?",
            (str(identifier),),
        ).fetchone()
        if row:
            return row["Z_PK"]
        error_exit(f"Note not found with UUID: {identifier}")
    else:
        try:
            pk = int(identifier)
        except ValueError:
            error_exit(f"Invalid note identifier: {identifier}")
        row = db.execute(
            "SELECT Z_PK FROM ZICCLOUDSYNCINGOBJECT WHERE Z_PK = ? AND ZTITLE1 IS NOT NULL",
            (pk,),
        ).fetchone()
        if row:
            return row["Z_PK"]
        error_exit(f"Note not found with ID: {identifier}")


def get_note_body(db, note_pk):
    """Get the text body of a note by its Z_PK."""
    row = db.execute(
        """SELECT nd.ZDATA FROM ZICCLOUDSYNCINGOBJECT n
           JOIN ZICCLOUDSYNCINGOBJECT nd ON nd.Z_PK = n.ZNOTEDATA
           WHERE n.Z_PK = ?""",
        (note_pk,),
    ).fetchone()
    if row and row["ZDATA"]:
        return extract_text_from_protobuf(row["ZDATA"])
    return ""


def get_folder_name(db, folder_pk):
    """Get folder name by Z_PK."""
    if folder_pk is None:
        return None
    row = db.execute(
        "SELECT ZTITLE2 FROM ZICCLOUDSYNCINGOBJECT WHERE Z_PK = ?",
        (folder_pk,),
    ).fetchone()
    return row["ZTITLE2"] if row else None


def run_applescript(script):
    """Run an AppleScript and return (success, output_or_error)."""
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        return False, result.stderr.strip()
    return True, result.stdout.strip()


def markdown_to_html(text):
    """Very basic markdown to HTML conversion for note bodies."""
    lines = text.split("\n")
    html_lines = []
    in_list = False
    for line in lines:
        # Headings
        if line.startswith("### "):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<h3>{line[4:]}</h3>")
        elif line.startswith("## "):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<h2>{line[3:]}</h2>")
        elif line.startswith("# "):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<h1>{line[2:]}</h1>")
        # Bullet list
        elif line.startswith("- ") or line.startswith("* "):
            if not in_list:
                html_lines.append("<ul>")
                in_list = True
            content = line[2:]
            # Bold
            content = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", content)
            # Italic
            content = re.sub(r"\*(.+?)\*", r"<i>\1</i>", content)
            html_lines.append(f"<li>{content}</li>")
        else:
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            if line.strip():
                # Inline formatting
                content = line
                content = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", content)
                content = re.sub(r"\*(.+?)\*", r"<i>\1</i>", content)
                content = re.sub(r"`(.+?)`", r"<code>\1</code>", content)
                html_lines.append(f"<p>{content}</p>")
    if in_list:
        html_lines.append("</ul>")
    return "\n".join(html_lines)


# ── CLI ──────────────────────────────────────────────────────────────────

@click.group()
def cli():
    """Apple Notes CLI — read via SQLite, write via AppleScript."""
    pass


# ── READ COMMANDS ────────────────────────────────────────────────────────

@cli.command("list")
@click.option("--folder", default=None, help="Filter by folder name")
@click.option("--limit", default=None, type=int, help="Limit number of results")
@click.option("--pinned", is_flag=True, help="Show pinned notes only")
@click.option("--include-deleted", is_flag=True, help="Include deleted notes")
@click.option("--human", is_flag=True, help="Human-readable table output")
def list_notes(folder, limit, pinned, include_deleted, human):
    """List all notes as JSON."""
    db = get_db()
    query = """
        SELECT n.Z_PK, n.ZIDENTIFIER, n.ZTITLE1, n.ZCREATIONDATE1,
               n.ZMODIFICATIONDATE1, n.ZFOLDER, n.ZISPINNED, n.ZTRASHEDSTATE
        FROM ZICCLOUDSYNCINGOBJECT n
        WHERE n.ZTITLE1 IS NOT NULL
    """
    params = []

    if not include_deleted:
        query += " AND (n.ZTRASHEDSTATE = 0 OR n.ZTRASHEDSTATE IS NULL)"

    if pinned:
        query += " AND n.ZISPINNED = 1"

    if folder:
        query += """ AND n.ZFOLDER IN (
            SELECT Z_PK FROM ZICCLOUDSYNCINGOBJECT WHERE ZTITLE2 = ?
        )"""
        params.append(folder)

    query += " ORDER BY n.ZMODIFICATIONDATE1 DESC"

    if limit:
        query += " LIMIT ?"
        params.append(limit)

    rows = db.execute(query, params).fetchall()

    notes = []
    for row in rows:
        notes.append({
            "id": row["Z_PK"],
            "uuid": row["ZIDENTIFIER"],
            "title": row["ZTITLE1"],
            "folder": get_folder_name(db, row["ZFOLDER"]),
            "created": coredata_to_iso(row["ZCREATIONDATE1"]),
            "modified": coredata_to_iso(row["ZMODIFICATIONDATE1"]),
            "pinned": bool(row["ZISPINNED"]),
            "deleted": bool(row["ZTRASHEDSTATE"]),
        })

    db.close()

    if human:
        if not notes:
            print("No notes found.")
            return
        # Print table
        print(f"{'ID':<6} {'Title':<40} {'Folder':<20} {'Modified':<25} {'Pin'}")
        print("-" * 95)
        for n in notes:
            title = (n["title"] or "")[:38]
            folder_name = (n["folder"] or "")[:18]
            modified = (n["modified"] or "")[:23]
            pin = "*" if n["pinned"] else ""
            print(f"{n['id']:<6} {title:<40} {folder_name:<20} {modified:<25} {pin}")
    else:
        print(json.dumps(notes, indent=2))


@cli.command("read")
@click.argument("identifier")
@click.option("--format", "fmt", type=click.Choice(["text", "markdown", "html"]), default=None,
              help="Output format (default: JSON with metadata)")
def read_note(identifier, fmt):
    """Read a note by ID (integer Z_PK or UUID)."""
    db = get_db()
    pk = resolve_note_id(db, identifier)

    row = db.execute(
        """SELECT n.Z_PK, n.ZIDENTIFIER, n.ZTITLE1, n.ZCREATIONDATE1,
                  n.ZMODIFICATIONDATE1, n.ZFOLDER, n.ZISPINNED, n.ZTRASHEDSTATE
           FROM ZICCLOUDSYNCINGOBJECT n WHERE n.Z_PK = ?""",
        (pk,),
    ).fetchone()

    body = get_note_body(db, pk)
    db.close()

    if fmt == "text":
        print(body)
    elif fmt == "markdown":
        # Simple text-to-markdown: just output as-is since extracted text is plain
        print(body)
    elif fmt == "html":
        print(f"<h1>{row['ZTITLE1'] or ''}</h1>\n<p>{body}</p>")
    else:
        note = {
            "id": row["Z_PK"],
            "uuid": row["ZIDENTIFIER"],
            "title": row["ZTITLE1"],
            "folder": get_folder_name(get_db(), row["ZFOLDER"]),
            "created": coredata_to_iso(row["ZCREATIONDATE1"]),
            "modified": coredata_to_iso(row["ZMODIFICATIONDATE1"]),
            "pinned": bool(row["ZISPINNED"]),
            "deleted": bool(row["ZTRASHEDSTATE"]),
            "body": body,
        }
        print(json.dumps(note, indent=2))


@cli.command("search")
@click.argument("query")
@click.option("--folder", default=None, help="Filter by folder name")
@click.option("--include-deleted", is_flag=True, help="Include deleted notes")
def search_notes(query, folder, include_deleted):
    """Search notes by text content."""
    db = get_db()

    sql = """
        SELECT n.Z_PK, n.ZIDENTIFIER, n.ZTITLE1, n.ZCREATIONDATE1,
               n.ZMODIFICATIONDATE1, n.ZFOLDER, n.ZISPINNED, n.ZTRASHEDSTATE,
               nd.ZDATA
        FROM ZICCLOUDSYNCINGOBJECT n
        LEFT JOIN ZICCLOUDSYNCINGOBJECT nd ON nd.Z_PK = n.ZNOTEDATA
        WHERE n.ZTITLE1 IS NOT NULL
    """
    params = []

    if not include_deleted:
        sql += " AND (n.ZTRASHEDSTATE = 0 OR n.ZTRASHEDSTATE IS NULL)"

    if folder:
        sql += """ AND n.ZFOLDER IN (
            SELECT Z_PK FROM ZICCLOUDSYNCINGOBJECT WHERE ZTITLE2 = ?
        )"""
        params.append(folder)

    sql += " ORDER BY n.ZMODIFICATIONDATE1 DESC"

    rows = db.execute(sql, params).fetchall()

    query_lower = query.lower()
    results = []
    for row in rows:
        title = row["ZTITLE1"] or ""
        body = extract_text_from_protobuf(row["ZDATA"]) if row["ZDATA"] else ""

        if query_lower in title.lower() or query_lower in body.lower():
            # Find snippet around the match
            snippet = ""
            body_lower = body.lower()
            idx = body_lower.find(query_lower)
            if idx >= 0:
                start = max(0, idx - 50)
                end = min(len(body), idx + len(query) + 50)
                snippet = body[start:end].replace("\n", " ")
                if start > 0:
                    snippet = "..." + snippet
                if end < len(body):
                    snippet = snippet + "..."
            elif query_lower in title.lower():
                snippet = body[:100].replace("\n", " ") if body else ""

            results.append({
                "id": row["Z_PK"],
                "uuid": row["ZIDENTIFIER"],
                "title": title,
                "folder": get_folder_name(db, row["ZFOLDER"]),
                "modified": coredata_to_iso(row["ZMODIFICATIONDATE1"]),
                "snippet": snippet,
            })

    db.close()
    print(json.dumps(results, indent=2))


@cli.command("folders")
def list_folders():
    """List all folders."""
    db = get_db()
    rows = db.execute(
        """SELECT Z_PK, ZIDENTIFIER, ZTITLE2, ZPARENT
           FROM ZICCLOUDSYNCINGOBJECT
           WHERE ZTITLE2 IS NOT NULL
           ORDER BY ZTITLE2"""
    ).fetchall()

    folders = []
    for row in rows:
        folders.append({
            "id": row["Z_PK"],
            "uuid": row["ZIDENTIFIER"],
            "name": row["ZTITLE2"],
            "parent_id": row["ZPARENT"],
        })

    db.close()
    print(json.dumps(folders, indent=2))


@cli.command("attachments")
@click.argument("identifier")
def list_attachments(identifier):
    """List attachments for a note."""
    db = get_db()
    pk = resolve_note_id(db, identifier)

    rows = db.execute(
        """SELECT a.Z_PK, a.ZIDENTIFIER, a.ZTYPEUTI, a.ZFILENAME, a.ZTITLE1 as ATITLE
           FROM ZICCLOUDSYNCINGOBJECT a
           WHERE a.ZNOTE = ? AND a.ZTYPEUTI IS NOT NULL
           ORDER BY a.Z_PK""",
        (pk,),
    ).fetchall()

    attachments = []
    for row in rows:
        attachments.append({
            "id": row["Z_PK"],
            "uuid": row["ZIDENTIFIER"],
            "type": row["ZTYPEUTI"],
            "filename": row["ZFILENAME"],
            "title": row["ATITLE"],
        })

    db.close()
    print(json.dumps(attachments, indent=2))


@cli.command("extract")
@click.argument("uuid")
@click.option("--output", default=None, help="Output file path")
def extract_attachment(uuid, output):
    """Extract an attachment to disk by UUID."""
    db = get_db()

    row = db.execute(
        """SELECT a.ZIDENTIFIER, a.ZFILENAME, a.ZTYPEUTI
           FROM ZICCLOUDSYNCINGOBJECT a
           WHERE a.ZIDENTIFIER = ?""",
        (uuid,),
    ).fetchone()

    if not row:
        db.close()
        error_exit(f"Attachment not found: {uuid}")

    # Attachments are stored in the file system under the Notes data directory
    notes_data_dir = os.path.expanduser(
        "~/Library/Group Containers/group.com.apple.notes"
    )

    # Search for the file by identifier in known attachment paths
    found_path = None
    for root, dirs, files in os.walk(os.path.join(notes_data_dir, "Media")):
        for f in files:
            full = os.path.join(root, f)
            if uuid in full or (row["ZFILENAME"] and f == row["ZFILENAME"]):
                found_path = full
                break
        if found_path:
            break

    # Also check Accounts directories
    if not found_path:
        accounts_dir = os.path.join(notes_data_dir, "Accounts")
        if os.path.exists(accounts_dir):
            for root, dirs, files in os.walk(accounts_dir):
                for f in files:
                    full = os.path.join(root, f)
                    if uuid in root or (row["ZFILENAME"] and f == row["ZFILENAME"] and uuid in root):
                        found_path = full
                        break
                if found_path:
                    break

    db.close()

    if not found_path:
        error_exit(f"Attachment file not found on disk for UUID: {uuid}")

    dest = output or row["ZFILENAME"] or os.path.basename(found_path)
    shutil.copy2(found_path, dest)
    print(json.dumps({"extracted": dest, "uuid": uuid, "size": os.path.getsize(dest)}))


@cli.command("checklists")
@click.argument("identifier")
def show_checklists(identifier):
    """Show checklist items with completion status."""
    db = get_db()
    pk = resolve_note_id(db, identifier)

    # Note body contains checklist data in the protobuf. We also check for
    # checklist records in the database.
    body = get_note_body(db, pk)

    # Check for checklist items in the ZICCLOUDSYNCINGOBJECT table
    rows = db.execute(
        """SELECT Z_PK, ZIDENTIFIER, ZTITLE1, ZISPASSWORDPROTECTED
           FROM ZICCLOUDSYNCINGOBJECT
           WHERE ZNOTE = ? AND ZTYPEUTI = 'com.apple.notes.inlinetextattachment.checklist'
           ORDER BY Z_PK""",
        (pk,),
    ).fetchall()

    if rows:
        items = []
        for row in rows:
            items.append({
                "id": row["Z_PK"],
                "uuid": row["ZIDENTIFIER"],
                "text": row["ZTITLE1"],
            })
        db.close()
        print(json.dumps(items, indent=2))
        return

    # Fallback: try to extract checklist-like content from the note body
    # Look for lines that might be checklist items
    lines = body.split("\n")
    items = []
    for line in lines:
        stripped = line.strip()
        if stripped:
            items.append({"text": stripped, "source": "body_text"})

    db.close()

    if items:
        print(json.dumps({"note_id": pk, "items": items, "note": "Extracted from note body text"}, indent=2))
    else:
        print(json.dumps({"note_id": pk, "items": [], "note": "No checklist items found"}, indent=2))


# ── WRITE COMMANDS ───────────────────────────────────────────────────────

@cli.command("create")
@click.option("--folder", default="Notes", help="Folder name (default: Notes)")
@click.option("--title", required=True, help="Note title")
@click.option("--body", default="", help="Note body content")
@click.option("--format", "fmt", type=click.Choice(["text", "html", "markdown"]), default="text",
              help="Body format")
def create_note(folder, title, body, fmt):
    """Create a new note via AppleScript."""
    if fmt == "markdown":
        body = markdown_to_html(body)
        fmt = "html"

    if fmt == "html":
        html_body = body
    else:
        # Escape for AppleScript and wrap in simple HTML
        html_body = f"<p>{body}</p>" if body else ""

    # Escape for AppleScript string
    escaped_title = title.replace("\\", "\\\\").replace('"', '\\"')
    escaped_body = html_body.replace("\\", "\\\\").replace('"', '\\"')
    escaped_folder = folder.replace("\\", "\\\\").replace('"', '\\"')

    script = f'''
tell application "Notes"
    set theFolder to folder "{escaped_folder}"
    set theNote to make new note at theFolder with properties {{name:"{escaped_title}", body:"{escaped_body}"}}
    set noteId to id of theNote
    return noteId
end tell
'''

    ok, result = run_applescript(script)
    if ok:
        print(json.dumps({"created": True, "title": title, "folder": folder, "apple_id": result}))
    else:
        error_exit(f"Failed to create note: {result}")


@cli.command("append")
@click.argument("identifier")
@click.option("--body", required=True, help="Content to append")
@click.option("--format", "fmt", type=click.Choice(["text", "html", "markdown"]), default="text",
              help="Body format")
def append_to_note(identifier, body, fmt):
    """Append content to an existing note via AppleScript."""
    # Resolve to get the title for AppleScript targeting
    db = get_db()
    pk = resolve_note_id(db, identifier)
    row = db.execute(
        "SELECT ZTITLE1, ZIDENTIFIER FROM ZICCLOUDSYNCINGOBJECT WHERE Z_PK = ?",
        (pk,),
    ).fetchone()
    note_title = row["ZTITLE1"]
    db.close()

    if fmt == "markdown":
        body = markdown_to_html(body)
        fmt = "html"

    if fmt == "html":
        append_html = body
    else:
        append_html = f"<p>{body}</p>"

    escaped_title = note_title.replace("\\", "\\\\").replace('"', '\\"')
    escaped_body = append_html.replace("\\", "\\\\").replace('"', '\\"')

    script = f'''
tell application "Notes"
    set theNote to first note whose name is "{escaped_title}"
    set currentBody to body of theNote
    set body of theNote to currentBody & "{escaped_body}"
end tell
'''

    ok, result = run_applescript(script)
    if ok:
        print(json.dumps({"appended": True, "note_id": pk, "title": note_title}))
    else:
        error_exit(f"Failed to append to note: {result}")


@cli.command("move")
@click.argument("identifier")
@click.option("--folder", required=True, help="Destination folder name")
def move_note(identifier, folder):
    """Move a note to a different folder via AppleScript."""
    db = get_db()
    pk = resolve_note_id(db, identifier)
    row = db.execute(
        "SELECT ZTITLE1 FROM ZICCLOUDSYNCINGOBJECT WHERE Z_PK = ?",
        (pk,),
    ).fetchone()
    note_title = row["ZTITLE1"]
    db.close()

    escaped_title = note_title.replace("\\", "\\\\").replace('"', '\\"')
    escaped_folder = folder.replace("\\", "\\\\").replace('"', '\\"')

    script = f'''
tell application "Notes"
    set theNote to first note whose name is "{escaped_title}"
    move theNote to folder "{escaped_folder}"
end tell
'''

    ok, result = run_applescript(script)
    if ok:
        print(json.dumps({"moved": True, "note_id": pk, "title": note_title, "folder": folder}))
    else:
        error_exit(f"Failed to move note: {result}")


@cli.command("delete")
@click.argument("identifier")
def delete_note(identifier):
    """Delete a note (moves to Recently Deleted) via AppleScript."""
    db = get_db()
    pk = resolve_note_id(db, identifier)
    row = db.execute(
        "SELECT ZTITLE1 FROM ZICCLOUDSYNCINGOBJECT WHERE Z_PK = ?",
        (pk,),
    ).fetchone()
    note_title = row["ZTITLE1"]
    db.close()

    escaped_title = note_title.replace("\\", "\\\\").replace('"', '\\"')

    script = f'''
tell application "Notes"
    delete (first note whose name is "{escaped_title}")
end tell
'''

    ok, result = run_applescript(script)
    if ok:
        print(json.dumps({"deleted": True, "note_id": pk, "title": note_title}))
    else:
        error_exit(f"Failed to delete note: {result}")


if __name__ == "__main__":
    cli()
