const path = require('path');
const gnani = require('./gnaniClient');
const chunkedSync = require('./chunkedSync');
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

// Primary path, per Gnani's docs: create a batch job, start it, poll until it
// finishes, then fetch the transcript.
async function transcribeViaBatch(note, filePath) {
  const jobId = await gnani.createJob(filePath, note.original_filename, note.language_code);
  updateNote(note.id, { gnani_job_id: jobId });

  await gnani.startJob(jobId);
  const finalStatus = await waitForJobCompletion(jobId);

  if (finalStatus.status === 'FAILED' || finalStatus.status === 'START_FAILED') {
    throw new Error(`Gnani batch job ended in ${finalStatus.status}`);
  }
  if (finalStatus.status === 'CANCELLED') {
    throw new Error('Gnani batch job was cancelled');
  }

  const filesResult = await gnani.getJobFiles(jobId);
  const fileEntry = filesResult.files?.[0] ?? filesResult.transcripts?.[0];
  if (!fileEntry) throw new Error('Gnani job completed but returned no transcript file');

  let transcript;
  let durationSeconds = null;

  if (fileEntry.full_transcript) {
    transcript = fileEntry.full_transcript;
    durationSeconds = fileEntry.duration_seconds ?? null;
  } else if (fileEntry.transcript_url) {
    const transcriptData = await gnani.fetchTranscript(fileEntry.transcript_url);
    transcript = transcriptData.full_transcript;
    durationSeconds = transcriptData.duration_seconds ?? null;
  } else {
    throw new Error('Gnani returned a file entry with no transcript');
  }

  if (!transcript || !transcript.trim()) {
    throw new Error('Gnani returned an empty transcript');
  }

  return { transcript, durationSeconds };
}

async function processNote(note) {
  const filePath = path.join(UPLOADS_DIR, note.stored_filename);

  try {
    updateNote(note.id, { status: STATUSES.TRANSCRIBING });

    let result;
    try {
      result = await transcribeViaBatch(note, filePath);
    } catch (batchErr) {
      console.warn(`[note ${note.id}] batch transcription failed, falling back to chunked sync: ${batchErr.message}`);
      result = await chunkedSync.transcribe(filePath, note.language_code);
    }

    if (!result.transcript || !result.transcript.trim()) {
      throw new Error('Transcription produced no text');
    }

    updateNote(note.id, {
      status: STATUSES.SUMMARIZING,
      transcript: result.transcript,
      duration_seconds: result.durationSeconds,
    });

    const summary = await summarize(result.transcript);

    updateNote(note.id, { status: STATUSES.DONE, summary });
  } catch (err) {
    updateNote(note.id, {
      status: STATUSES.FAILED,
      error_message: err.message || 'Unknown error while processing this note',
    });
  }
}

module.exports = { processNote };
