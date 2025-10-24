# Summarizer Agent (Render-ready, JavaScript)

This is a minimal Node.js agent that accepts **PDF / JPG / PNG / MP4** and returns
a summary (and transcript for MP4).

## Endpoints
- `POST /process` — multipart form with:
  - `file` — the uploaded file
  - `callbackUrl` — your Lovable callback endpoint

It responds immediately with `{ status: "received" }` and then POSTs back to
`callbackUrl` when finished with:
```json
{
  "status": "succeeded",
  "abstract": "...",
  "bullets": ["..."],
  "quotes": ["..."],
  "transcript": "..." // only for MP4
}
```

## Environment variables
- `OPENAI_API_KEY` (required)
- `PORT` (default 8787)

## Deploy on Render
- Create a **Web Service**
- Build command: `npm install`
- Start command: `npm start`
- Add env var `OPENAI_API_KEY`
- Free plan works.

## Notes / Limits
- PDFs with a text layer are supported (via `pdf-parse`).
- **Scanned PDFs** OCR is not included in this starter (images via JPG/PNG OCR are supported).
  If you need OCR for scanned PDFs, convert pages to images server-side or use a managed OCR API.
