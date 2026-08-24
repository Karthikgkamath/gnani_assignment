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

async function deleteNoteRequest(id) {
  const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
}

// ---------- Upload / list page ----------

function initUploadPage() {
  loadNoteList();

  const list = document.getElementById('note-list');
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('.delete-note-btn');
    if (!btn) return;
    if (!confirm('Delete this note? This cannot be undone.')) return;
    btn.disabled = true;
    try {
      await deleteNoteRequest(btn.dataset.id);
      loadNoteList();
    } catch {
      alert('Could not delete this note. Please try again.');
      btn.disabled = false;
    }
  });

  const form = document.getElementById('upload-form');
  const submitBtn = document.getElementById('submit-btn');
  const progressWrap = document.getElementById('progress-wrap');
  const progressFill = document.getElementById('progress-fill');
  const progressPct = document.getElementById('progress-pct');
  const errorBox = document.getElementById('upload-error');

  function setProgress(pct) {
    progressFill.value = pct;
    progressPct.textContent = `${pct}%`;
  }

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
    progressWrap.style.display = 'flex';
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/notes');

    xhr.upload.addEventListener('progress', (evt) => {
      if (evt.lengthComputable) {
        setProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    });

    xhr.onload = () => {
      submitBtn.disabled = false;
      let body;
      try { body = JSON.parse(xhr.responseText); } catch { body = null; }

      if (xhr.status >= 200 && xhr.status < 300 && body?.id) {
        setProgress(100);
        // Briefly show the completed bar instead of jumping straight to the next page.
        setTimeout(() => { window.location.href = `/note.html?id=${body.id}`; }, 300);
        return;
      }

      progressWrap.style.display = 'none';
      errorBox.textContent = body?.error || `Upload failed (HTTP ${xhr.status}). Please try again.`;
      errorBox.style.display = 'block';
    };

    xhr.onerror = () => {
      submitBtn.disabled = false;
      progressWrap.style.display = 'none';
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
          <div>
            <a href="/note.html?id=${n.id}">${escapeHtml(n.original_filename)}</a>
            <span class="badge ${n.status}">${statusLabel(n.status)}</span>
            <div class="note-meta">${formatDate(n.created_at)} &middot; ${n.language_code}${n.error_message ? ` &middot; ${escapeHtml(n.error_message)}` : ''}</div>
          </div>
          <button type="button" class="danger delete-note-btn" data-id="${n.id}">Delete</button>
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
  // Set once, outside the polling re-render, so playback doesn't reset every 3s.
  document.getElementById('audio-player').src = `/api/notes/${id}/audio`;

  document.getElementById('delete-btn').addEventListener('click', async () => {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    try {
      await deleteNoteRequest(id);
      window.location.href = '/';
    } catch {
      alert('Could not delete this note. Please try again.');
    }
  });

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

  const order = ['uploaded', 'transcribing', 'summarizing', 'done'];
  const currentIndex = order.indexOf(note.status);
  const steps = document.querySelectorAll('.stepper-step');
  const lines = document.querySelectorAll('.stepper-line');

  steps.forEach((el, i) => {
    const circle = el.querySelector('.stepper-circle');
    el.classList.remove('active', 'complete', 'failed');

    if (note.status === 'failed' && i === currentIndex) {
      el.classList.add('failed');
      circle.textContent = '✕';
    } else if (i < currentIndex || note.status === 'done') {
      el.classList.add('complete');
      circle.textContent = '✓';
    } else if (i === currentIndex) {
      el.classList.add('active');
      circle.textContent = String(i + 1);
    } else {
      circle.textContent = String(i + 1);
    }
  });

  lines.forEach((line, i) => {
    line.classList.toggle('filled', i < currentIndex || note.status === 'done');
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
