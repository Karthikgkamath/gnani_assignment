function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function statusLabel(status) {
  return { uploaded: 'Uploaded', transcribing: 'Transcribing', summarizing: 'Summarizing', done: 'Done', failed: 'Failed' }[status] || status;
}

function formatDate(iso) {
  return new Date(iso + 'Z').toLocaleString();
}

// ---------- Upload / list page ----------

function initUploadPage() {
  loadNoteList();

  const form = document.getElementById('upload-form');
  const submitBtn = document.getElementById('submit-btn');
  const progressBar = document.getElementById('progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const errorBox = document.getElementById('upload-error');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';

    const fileInput = document.getElementById('audio');
    const languageSelect = document.getElementById('language');
    if (!fileInput.files[0]) return;

    const formData = new FormData();
    formData.append('audio', fileInput.files[0]);
    formData.append('language_code', languageSelect.value);

    submitBtn.disabled = true;
    progressBar.style.display = 'block';
    progressFill.style.width = '0%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/notes');

    xhr.upload.addEventListener('progress', (evt) => {
      if (evt.lengthComputable) {
        progressFill.style.width = `${Math.round((evt.loaded / evt.total) * 100)}%`;
      }
    });

    xhr.onload = () => {
      submitBtn.disabled = false;
      let body;
      try { body = JSON.parse(xhr.responseText); } catch { body = null; }

      if (xhr.status >= 200 && xhr.status < 300 && body?.id) {
        window.location.href = `/note.html?id=${body.id}`;
        return;
      }

      progressBar.style.display = 'none';
      errorBox.textContent = body?.error || `Upload failed (HTTP ${xhr.status}). Please try again.`;
      errorBox.style.display = 'block';
    };

    xhr.onerror = () => {
      submitBtn.disabled = false;
      progressBar.style.display = 'none';
      errorBox.textContent = 'Network error during upload. Check your connection and try again.';
      errorBox.style.display = 'block';
    };

    xhr.send(formData);
  });
}

async function loadNoteList() {
  const list = document.getElementById('note-list');
  try {
    const res = await fetch('/api/notes');
    if (!res.ok) throw new Error('Failed to load notes');
    const notes = await res.json();

    if (notes.length === 0) {
      list.innerHTML = '<li class="empty">No uploads yet. Add one above.</li>';
      return;
    }

    list.innerHTML = notes
      .map(
        (n) => `
        <li>
          <a href="/note.html?id=${n.id}">${escapeHtml(n.original_filename)}</a>
          <span class="badge ${n.status}">${statusLabel(n.status)}</span>
          <div class="note-meta">${formatDate(n.created_at)} &middot; ${n.language_code}${n.error_message ? ` &middot; ${escapeHtml(n.error_message)}` : ''}</div>
        </li>`
      )
      .join('');
  } catch (err) {
    list.innerHTML = '<li class="empty">Could not load past uploads. Refresh to try again.</li>';
  }
}

// ---------- Note detail page ----------

function initNotePage() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) {
    document.getElementById('note-title').textContent = 'Note not found';
    return;
  }
  pollNote(id);
}

async function pollNote(id) {
  try {
    const res = await fetch(`/api/notes/${id}`);
    if (res.status === 404) {
      document.getElementById('note-title').textContent = 'Note not found';
      document.getElementById('note-meta').textContent = 'This upload does not exist (or was removed).';
      return;
    }
    if (!res.ok) throw new Error('Failed to load note');
    const note = await res.json();

    renderNote(note);

    if (note.status !== 'done' && note.status !== 'failed') {
      setTimeout(() => pollNote(id), 3000);
    }
  } catch (err) {
    document.getElementById('note-error').textContent = 'Lost connection while checking status. Retrying...';
    document.getElementById('note-error').style.display = 'block';
    setTimeout(() => pollNote(id), 5000);
  }
}

function renderNote(note) {
  document.getElementById('note-title').textContent = note.original_filename;
  document.getElementById('note-meta').textContent =
    `${formatDate(note.created_at)} · ${note.language_code}${note.duration_seconds ? ` · ${Math.round(note.duration_seconds)}s` : ''}`;

  const steps = document.querySelectorAll('.step');
  const order = ['uploaded', 'transcribing', 'summarizing', 'done'];
  const currentIndex = order.indexOf(note.status);

  steps.forEach((el) => {
    const stepIndex = order.indexOf(el.dataset.step);
    el.classList.remove('active', 'complete', 'failed');
    if (note.status === 'failed') {
      if (stepIndex <= currentIndex) el.classList.add('failed');
    } else if (stepIndex < currentIndex || note.status === 'done') {
      el.classList.add('complete');
    } else if (stepIndex === currentIndex) {
      el.classList.add('active');
    }
  });

  const errorBox = document.getElementById('note-error');
  if (note.status === 'failed') {
    errorBox.textContent = note.error_message || 'Processing failed for an unknown reason.';
    errorBox.style.display = 'block';
  } else {
    errorBox.style.display = 'none';
  }

  const body = document.getElementById('note-body');

  if (note.status === 'uploaded' || note.status === 'transcribing') {
    body.innerHTML = `<p class="subtle"><span class="spinner"></span>Transcribing your audio&hellip; this can take a minute or two for longer files.</p>`;
    return;
  }
  if (note.status === 'summarizing') {
    body.innerHTML = `
      <h2>Transcript</h2>
      <div class="panel transcript">${escapeHtml(note.transcript)}</div>
      <p class="subtle"><span class="spinner"></span>Generating summary&hellip;</p>`;
    return;
  }
  if (note.status === 'done') {
    body.innerHTML = `
      <h2>Summary</h2>
      <div class="panel summary">${escapeHtml(note.summary)}</div>
      <h2>Transcript</h2>
      <div class="panel transcript">${escapeHtml(note.transcript)}</div>`;
    return;
  }
  if (note.status === 'failed') {
    body.innerHTML = note.transcript
      ? `<h2>Transcript</h2><div class="panel transcript">${escapeHtml(note.transcript)}</div>`
      : '';
  }
}
