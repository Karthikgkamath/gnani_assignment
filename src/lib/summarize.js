const REQUEST_TIMEOUT_MS = 30_000;

async function summarize(transcript) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prompt = [
    'Summarize the following audio transcript for someone who did not listen to it.',
    'Give a short paragraph overview, then a few bullet points for key takeaways or action items if any.',
    'Keep it concise. Respond in plain text, no markdown headers.',
    '',
    'Transcript:',
    transcript,
  ].join('\n');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API failed: ${res.status} ${res.statusText} ${body}`.trim());
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  if (!text.trim()) throw new Error('Gemini returned an empty summary');
  return text.trim();
}

module.exports = { summarize };
