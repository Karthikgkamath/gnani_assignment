const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { UPLOADS_DIR } = require('../db');
const { createNote } = require('../notesRepo');
const { enqueue } = require('../lib/jobQueue');

const router = express.Router();

const MAX_FILE_BYTES = 10 * 1024 * 1024; // Gnani batch API's per-file limit
const ALLOWED_EXTENSIONS = new Set([
  '.wav', '.mp3', '.mp4', '.flac', '.ogg', '.opus', '.m4a', '.aac', '.webm', '.amr',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error(`Unsupported file type "${ext}". Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`));
      return;
    }
    cb(null, true);
  },
});

router.post('/api/notes', (req, res) => {
  upload.single('audio')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File is too large. Max size is ${MAX_FILE_BYTES / 1024 / 1024}MB.` });
    }
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file was uploaded' });
    }

    const languageCode = req.body.language_code || 'en-IN';

    try {
      const note = createNote({
        originalFilename: req.file.originalname,
        storedFilename: req.file.filename,
        fileSize: req.file.size,
        languageCode,
      });
      enqueue(note);
      res.status(201).json(note);
    } catch (dbErr) {
      res.status(500).json({ error: 'Could not save the upload. Please try again.' });
    }
  });
});

module.exports = router;
