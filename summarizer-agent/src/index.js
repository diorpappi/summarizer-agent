// Load env FIRST so other modules see OPENAI_API_KEY
import 'dotenv/config';

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

import { extractFromPdf } from './pdf.js';
import { ocrImage } from './ocr.js';
import { transcribeMp4 } from './video.js';
import { summarizeText } from './summarize.js';

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 8787;

// Allow browser uploads (Lovable, etc.)
app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'] }));
app.use(express.json({ limit: '10mb' }));

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'summarizer-agent', mode: 'sync' });
});

app.post('/process', upload.any(), async (req, res) => {
  // accept any field name; take the first file
  const file = Array.isArray(req.files) && req.files[0] ? req.files[0] : null;
  if (!file) {
    return res.status(400).json({ status: 'failed', error: 'No file uploaded' });
  }

  const cleanup = () => fs.existsSync(file.path) && fs.unlinkSync(file.path);

  try {
    const ext = (path.extname(file.originalname || '') || '').toLowerCase();
    const mt = (mime.lookup(ext) || file.mimetype || '').toString();

    let text = '';
    let transcript = '';

    if (mt.includes('video') || ext === '.mp4') {
      transcript = await transcribeMp4(file.path);
      text = transcript || '';
    } else if (ext === '.pdf' || mt === 'application/pdf') {
      text = await extractFromPdf(file.path);
    } else if (['.jpg','.jpeg','.png'].includes(ext) || mt.startsWith('image/')) {
      text = await ocrImage(file.path);
    } else {
      throw new Error(`Unsupported file type: ${ext || mt}`);
    }

    if (!text || text.trim().length < 20) {
      throw new Error('No readable text found in the file.');
    }

    const summary = await summarizeText(text);

    res.json({
      status: 'succeeded',
      abstract: summary.abstract,
      bullets: summary.bullets,
      quotes: summary.quotes,
      ...(transcript ? { transcript } : {})
    });
  } catch (err) {
    res.status(500).json({ status: 'failed', error: err.message });
  } finally {
    cleanup();
  }
});

app.listen(PORT, () => {
  console.log(`✅ Summarizer agent running on port ${PORT}`);
});
