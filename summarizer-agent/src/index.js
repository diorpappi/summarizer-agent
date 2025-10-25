import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import mime from "mime-types";
import dotenv from "dotenv";
import { extractFromPdf } from "./pdf.js";
import { ocrImage } from "./ocr.js";
import { transcribeMp4 } from "./video.js";
import { summarizeText } from "./summarize.js";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));

// Multer for file uploads
const upload = multer({ dest: "uploads/" });

// Health check route
app.get("/", (_, res) => {
  res.json({ ok: true, service: "summarizer-agent", mode: "sync-or-async" });
});

/**
 * POST /process
 * Handles both sync and async summarization
 */
app.post("/process", upload.single("file"), async (req, res) => {
  const file = req.file;
  const callbackUrl = req.body?.callbackUrl;

  if (!file) {
    return res
      .status(400)
      .json({ status: "failed", error: "No file uploaded" });
  }

  // ---------- PROCESS FUNCTION ----------
  const runPipeline = async () => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mimeType = mime.lookup(ext) || file.mimetype || "";

    let extractedText = "";
    let transcript = "";

    if (mimeType.includes("video") || ext === ".mp4") {
      transcript = await transcribeMp4(file.path);
      extractedText = transcript;
    } else if (ext === ".pdf" || mimeType === "application/pdf") {
      extractedText = await extractFromPdf(file.path);
    } else if (
      [".jpg", ".jpeg", ".png"].includes(ext) ||
      mimeType.startsWith("image/")
    ) {
      extractedText = await ocrImage(file.path);
    } else {
      throw new Error(`Unsupported file type: ${ext || mimeType}`);
    }

    if (!extractedText || extractedText.trim().length < 20) {
      throw new Error(
        "No readable text found in file. Try uploading a clearer file."
      );
    }

    const summary = await summarizeText(extractedText);

    const payload = {
      status: "succeeded",
      abstract: summary.abstract,
      bullets: summary.bullets,
      quotes: summary.quotes,
      ...(transcript ? { transcript } : {}),
    };

    return payload;
  };

  // ---------- SYNC MODE ----------
  if (!callbackUrl) {
    try {
      const result = await runPipeline();
      res.json(result);
    } catch (err) {
      res.status(500).json({ status: "failed", error: err.message });
    } finally {
      fs.unlink(file.path, () => {});
    }
    return;
  }

  // ---------- ASYNC MODE ----------
  try {
    res.json({ status: "received" });
    const result = await runPipeline();

    await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
  } catch (err) {
    await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "failed", error: err.message }),
    });
  } finally {
    fs.unlink(file.path, () => {});
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`✅ Summarizer agent running on port ${PORT}`));
