# Audio Notes

Upload an audio file, get a transcript (via [Gnani's Batch STT API](https://docs.gnani.ai/api/STTBatch/Introduction)) and an LLM summary (Google Gemini). Past uploads are listed and reopenable.

See [`/architecture.html`](src/public/architecture.html) (or the deployed `/architecture` page) for how it actually works under the hood.

## Stack

- Node.js + Express, plain HTML/CSS/vanilla JS (no frontend framework)
- SQLite (`better-sqlite3`) for notes metadata
- Audio files stored on local disk
- [Gnani Batch STT](https://docs.gnani.ai/api/STTBatch/Introduction) for transcription
- Google Gemini (`gemini-2.5-flash`) for summarization

## Running locally

```bash
npm install
cp .env.example .env
# fill in GNANI_API_KEY and GEMINI_API_KEY in .env
npm start
```

Then open http://localhost:3000.

## Environment variables

| Variable | Description |
|---|---|
| `GNANI_API_KEY` | API key from the [Gnani dashboard](https://gnani.ai/speech-to-text-api) |
| `GEMINI_API_KEY` | API key from [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | Optional, defaults to `gemini-2.5-flash` |
| `DATA_DIR` | Where the SQLite db + uploaded audio live. Defaults to `./data` |
| `PORT` | Defaults to `3000` |

## Deploying to Render

This repo includes a `render.yaml` blueprint.

1. Push this repo to GitHub (already done if you're reading this on GitHub).
2. In the Render dashboard: **New > Blueprint**, point it at this repo.
3. Render will create a web service with a **1GB persistent disk** mounted at `/data` (needs the paid Starter plan — Render's free tier doesn't support persistent disks, so uploads/notes would be wiped on every redeploy or spin-down).
4. Set the `GNANI_API_KEY` and `GEMINI_API_KEY` secrets in the Render dashboard (they're marked `sync: false` in the blueprint so Render will prompt for them).
5. Deploy. Once it's up, the app is available at the URL Render gives you — no further setup needed.

If you'd rather stay on Render's free tier, drop the `disk:` block from `render.yaml` first; just know that uploaded notes won't survive a redeploy or idle spin-down.

## Notes / limitations

Gnani's batch endpoint caps individual files at **10MB**, which the upload form enforces. That comfortably covers several minutes of compressed audio (mp3/m4a/aac), but not long uncompressed WAV files.
