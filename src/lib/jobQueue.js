// Tiny in-process background queue. Good enough for a single-instance app.
// A real multi-instance deployment would swap this for a durable queue (e.g. BullMQ + Redis).
const { processNote } = require('./processNote');

const queue = [];
let running = false;

function enqueue(note) {
  queue.push(note);
  drain();
}

async function drain() {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    const note = queue.shift();
    await processNote(note);
  }
  running = false;
}

module.exports = { enqueue };
