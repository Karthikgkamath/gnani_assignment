require('dotenv').config();
const path = require('path');
const express = require('express');

require('./db'); // ensures data dir + schema exist before anything else runs

const uploadRoutes = require('./routes/upload');
const notesRoutes = require('./routes/notes');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(uploadRoutes);
app.use(notesRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Audio notes app listening on http://localhost:${PORT}`);
});
