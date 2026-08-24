// Fallback transcription path: splits audio into <=~55s pieces with ffmpeg and
// transcribes each with Gnani's synchronous /stt/v3 endpoint, then stitches the
// text back together. Used when the batch endpoint doesn't complete a job.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const gnani = require('./gnaniClient');

const execFileAsync = promisify(execFile);
// Gnani's docs say the sync endpoint's max is 60s ("ideal <=30s"), but in practice it
// hard-rejects anything over 30s (MAX_AUDIO_DURATION_EXCEEDED) - so we chunk at 25s to
// leave a safety margin against encoder rounding.
const CHUNK_SECONDS = 25;
const DELAY_BETWEEN_CALLS_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getDurationSeconds(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const seconds = parseFloat(stdout.trim());
  return Number.isFinite(seconds) ? seconds : null;
}

async function splitIntoChunks(filePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-chunks-'));
  const pattern = path.join(dir, 'chunk_%03d.mp3');
  await execFileAsync('ffmpeg', [
    '-y', '-i', filePath,
    '-ar', '16000', '-ac', '1', '-b:a', '64k',
    '-f', 'segment', '-segment_time', String(CHUNK_SECONDS), '-reset_timestamps', '1',
    pattern,
  ]);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('chunk_'))
    .sort()
    .map((f) => path.join(dir, f));
  return { dir, files };
}

async function transcribe(filePath, languageCode) {
  const durationSeconds = await getDurationSeconds(filePath);

  // Short enough to send as-is, no need to split.
  if (durationSeconds !== null && durationSeconds <= CHUNK_SECONDS + 2) {
    const transcript = await gnani.transcribeSync(filePath, languageCode);
    return { transcript, durationSeconds };
  }

  const { dir, files } = await splitIntoChunks(filePath);
  try {
    if (files.length === 0) throw new Error('Splitting the audio into chunks produced no files');

    const parts = [];
    for (const chunkPath of files) {
      const text = await gnani.transcribeSync(chunkPath, languageCode);
      parts.push((text || '').trim());
      await sleep(DELAY_BETWEEN_CALLS_MS);
    }
    return { transcript: parts.filter(Boolean).join(' '), durationSeconds };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { transcribe };
