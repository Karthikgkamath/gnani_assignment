const fs = require('fs');
const path = require('path');
const express = require('express');
const { getNote, listNotes, deleteNote } = require('../notesRepo');
const { UPLOADS_DIR } = require('../db');

const router = express.Router();

router.get('/api/notes', (req, res) => {
  res.json(listNotes());
});

router.get('/api/notes/:id', (req, res) => {
  const note = getNote(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json(note);
});

router.get('/api/notes/:id/audio', (req, res) => {
  const note = getNote(req.params.id);
  if (!note) return res.status(404).end();
  res.sendFile(path.join(UPLOADS_DIR, note.stored_filename), (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

router.delete('/api/notes/:id', (req, res) => {
  const note = getNote(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });

  fs.rm(path.join(UPLOADS_DIR, note.stored_filename), { force: true }, () => {
    deleteNote(note.id);
    res.status(204).end();
  });
});

module.exports = router;
