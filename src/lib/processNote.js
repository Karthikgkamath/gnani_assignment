const path = require('path');
const gnani = require('./gnaniClient');
const { summarize } = require('./summarize');
const { STATUSES, updateNote } = require('../notesRepo');
const { UPLOADS_DIR } = require('../db');

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_MS = 10 * 60 * 1000; // give up after 10 minutes of polling

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJobCompletion(jobId) {
  const deadline = Date.now() + MAX_POLL_MS;
  while (Date.now() < deadline) {
    const status = await gnani.getJobStatus(jobId);
    if (gnani.TERMINAL_STATUSES.has(status.status)) return status;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Timed out waiting for Gnani to finish transcribing');
}

async function processNote(note) {
  const filePath = path.join(UPLOADS_DIR, note.stored_filename);

  try {
    updateNote(note.id, { status: STATUSES.TRANSCRIBING });

    const jobId = await gnani.createJob(filePath, note.original_filename, note.language_code);
    updateNote(note.id, { gnani_job_id: jobId });

    await gnani.startJob(jobId);
    const finalStatus = await waitForJobCompletion(jobId);

    if (finalStatus.status === 'FAILED' || finalStatus.status === 'START_FAILED') {
      throw new Error(`Gnani transcription failed (${finalStatus.status})`);
    }
    if (finalStatus.status === 'CANCELLED') {
      throw new Error('Gnani transcription job was cancelled');
    }

    const filesResult = await gnani.getJobFiles(jobId);
    const fileEntry = filesResult.files?.[0] ?? filesResult.transcripts?.[0];
    if (!fileEntry) throw new Error('Gnani job completed but returned no transcript file');

    let transcriptText;
    let durationSeconds = null;

    if (fileEntry.full_transcript) {
      transcriptText = fileEntry.full_transcript;
      durationSeconds = fileEntry.duration_seconds ?? null;
    } else if (fileEntry.transcript_url) {
      const transcriptData = await gnani.fetchTranscript(fileEntry.transcript_url);
      transcriptText = transcriptData.full_transcript;
      durationSeconds = transcriptData.duration_seconds ?? null;
    } else {
      throw new Error('Gnani returned a file entry with no transcript');
    }

    if (!transcriptText || !transcriptText.trim()) {
      throw new Error('Gnani returned an empty transcript');
    }

    updateNote(note.id, {
      status: STATUSES.SUMMARIZING,
      transcript: transcriptText,
      duration_seconds: durationSeconds,
    });

    const summary = await summarize(transcriptText);

    updateNote(note.id, { status: STATUSES.DONE, summary });
  } catch (err) {
    updateNote(note.id, {
      status: STATUSES.FAILED,
      error_message: err.message || 'Unknown error while processing this note',
    });
  }
}

module.exports = { processNote };
