const fs = require('fs');

const BASE_URL = 'https://api.vachana.ai';
const REQUEST_TIMEOUT_MS = 30_000;

function apiKey() {
  const key = process.env.GNANI_API_KEY;
  if (!key) throw new Error('GNANI_API_KEY is not set');
  return key;
}

async function gnaniFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'X-API-Key-ID': apiKey(),
      ...options.headers,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gnani API ${path} failed: ${res.status} ${res.statusText} ${body}`.trim());
  }
  return res.json();
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

module.exports = { createJob, startJob, getJobStatus, getJobFiles, fetchTranscript, TERMINAL_STATUSES };
