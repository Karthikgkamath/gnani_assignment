const express = require('express');
const { getNote, listNotes } = require('../notesRepo');

const router = express.Router();

router.get('/api/notes', (req, res) => {
  res.json(listNotes());
});

router.get('/api/notes/:id', (req, res) => {
  const note = getNote(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json(note);
});

module.exports = router;
