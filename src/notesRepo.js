const { randomUUID } = require('crypto');
const { db } = require('./db');

const STATUSES = {
  UPLOADED: 'uploaded',
  TRANSCRIBING: 'transcribing',
  SUMMARIZING: 'summarizing',
  DONE: 'done',
  FAILED: 'failed',
};

function createNote({ originalFilename, storedFilename, fileSize, languageCode }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO notes (id, original_filename, stored_filename, file_size, language_code, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, originalFilename, storedFilename, fileSize, languageCode, STATUSES.UPLOADED);
  return getNote(id);
}

function getNote(id) {
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
}

function listNotes() {
  return db
    .prepare(
      `SELECT id, original_filename, status, language_code, error_message, duration_seconds, created_at, updated_at
       FROM notes ORDER BY created_at DESC`
    )
    .all();
}

function updateNote(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k]);
  db.prepare(`UPDATE notes SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(
    ...values,
    id
  );
}

module.exports = { STATUSES, createNote, getNote, listNotes, updateNote };
