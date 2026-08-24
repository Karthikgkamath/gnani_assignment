const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://api.vachana.ai';
const REQUEST_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUSES = new Set([429, 500, 503]);
const MAX_ATTEMPTS = 4;

function apiKey() {
  const key = process.env.GNANI_API_KEY;
  if (!key) throw new Error('GNANI_API_KEY is not set');
  return key;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The Gnani docs call 429/500/503 out explicitly as transient - retry those with backoff,
// fail immediately on anything else (bad request, auth, etc).
async function gnaniFetch(path, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'X-API-Key-ID': apiKey(),
        ...options.headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (res.ok) return res.json();

    const body = await res.text().catch(() => '');
    lastError = new Error(`Gnani API ${path} failed: ${res.status} ${res.statusText} ${body}`.trim());

    if (!RETRYABLE_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS) {
      throw lastError;
    }
    await sleep(2000 * 2 ** (attempt - 1)); // 2s, 4s, 8s
  }
  throw lastError;
}

// Creates a batch job with a single audio file and returns the job id.
async function createJob(filePath, originalFilename, languageCode) {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append(
    'config',
    JSON.stringify({
      model: 'gnani-prisma-v2.5',
      language_code: languageCode,
      mode: 'transcribe',
      with_diarization: false,
    })
  );
  form.append('files', new Blob([fileBuffer]), originalFilename);

  const data = await gnaniFetch('/stt/v3/batch/jobs', {
    method: 'POST',
    body: form,
  });
  return data.job_id;
}

// The synchronous /stt/v3 endpoint - capped at ~60s of audio by Gnani, but doesn't
// require the create/start/poll dance the batch endpoint does. Used as a fallback
// (in chunks) when the batch endpoint isn't cooperating.
async function transcribeSync(filePath, languageCode) {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('audio_file', new Blob([fileBuffer]), path.basename(filePath));
  form.append('language_code', languageCode);
  form.append('format', 'transcribe');

  const data = await gnaniFetch('/stt/v3', { method: 'POST', body: form });
  return data.transcript;
}

async function startJob(jobId) {
  return gnaniFetch(`/stt/v3/batch/jobs/${jobId}/start`, { method: 'POST' });
}

async function getJobStatus(jobId) {
  return gnaniFetch(`/stt/v3/batch/jobs/${jobId}`, { method: 'GET' });
}

async function getJobFiles(jobId) {
  return gnaniFetch(`/stt/v3/batch/jobs/${jobId}/files`, { method: 'GET' });
}

// transcript_url is a short-lived signed URL returned by getJobFiles - fetched directly, no API key needed.
async function fetchTranscript(transcriptUrl) {
  const res = await fetch(transcriptUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Fetching transcript failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'PARTIAL_FAILURE',
  'FAILED',
  'START_FAILED',
  'CANCELLED',
]);

module.exports = {
  createJob,
  startJob,
  getJobStatus,
  getJobFiles,
  fetchTranscript,
  transcribeSync,
  TERMINAL_STATUSES,
};
