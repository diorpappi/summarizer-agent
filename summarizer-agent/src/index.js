import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import mime from "mime-types";
import dotenv from "dotenv";
import fetch from "node-fetch";
import cors from "cors";

import { extractFromPdf } from "./pdf.js";
import { ocrImage } from "./ocr.js";
import { transcribeMp4 } from "./video.js";
import { summarizeText } from "./summarize.js";

dotenv.config();

const app = express();

// Allow Lovable (browser) to POST directly
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json({ limit: "10mb" }));

// Multer for file uploads — accept ANY field name
const upload = multer({ dest: "uploads/" });

app.get("/", (_, res) => {
  res.json({ ok: true, service: "summarizer-agent", mode: "sync-or-async" });
});

app.post("/process", upload.any(), async (req, res) => {
  // Accept 'file' or ANY other field name Lovable uses
  const file =
    (req.file) ||
    (Array.isArray(req.files) && req.files.length ? req.files[0] : null);

  const callbackUrl = req.body?.callbackUrl;

  if (!file) {
    return res
      .status(400)
      .json({ status: "failed", error: "No file uploaded (field name mismatch)." });
  }

  const runPipeline = async () => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mimeType = (mime.lookup(ext) || file.mimetype || "").toString();

    let extractedText = "";
    let transcript = "";

    if (mimeType.includes("video") || ext === ".mp4") {
      transcript = await transcribeMp4(file.path);
      extractedText = transcript;
    } else if (ext === ".pdf" || mimeType === "application/pdf") {
      extractedText = await extractFromPdf(file.path);
    } else if (
      [".jpg", ".jpeg", ".png"].includes(ext) ||
      (mimeType && mimeType.startsWith("image/"))
    ) {
      extractedText = await ocrImage(file.path);
    } else {
      throw new Error(`Unsupported file type: ${ext || mimeType}`);
    }

    if (!extractedText || extractedText.trim().length < 20) {
      throw new Error("No readable text found in file.");
    }

    const summary = await summarizeText(extractedText);

    return {
      status: "succeeded",
      abstract: summary.abstract,
      bullets: summary.bullets,
      quotes: summary.quotes,
      ...(transcript ? { transcript } : {}),
    };
  };

  // SYNC (no callbackUrl)
  if (!callbackUrl) {
    try {
      const payload = await runPipeline();
      res.json(payload);
    } catch (err) {
      res.status(500).json({ status: "failed", error: err.message });
    } finally {
      fs.unlink(file.path, () => {});
    }
    return;
  }

  // ASYNC (with callbackUrl)
  try {
    res.json({ status: "received" });
    const payload = await runPipeline();
    await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    try {
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed", error: err.message }),
      });
    } catch {}
  } finally {
    fs.unlink(file.path, () => {});
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`✅ Summarizer agent on :${PORT}`));
