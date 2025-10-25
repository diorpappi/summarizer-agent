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
app.use(express.json({ limit: "5mb" }));

// store uploads on disk (ok for Render free)
const upload = multer({ dest: "uploads/" });

// health
app.get("/", (_, res) =>
  res.json({ ok: true, service: "summarizer-agent", mode: "sync-or-async" })
);

/**
 * /process
 * - If body has callbackUrl => ASYNC mode (immediate 200 + later POST to callback)
 * - If no callbackUrl => SYNC mode (hold connection and return the summary JSON directly)
 */
app.post("/process", upload.single("file"), async (req, res) => {
  const file = req.file;
  const callbackUrl = req.body?.callbackUrl;

  if (!file) {
    return res.status(400).json({ status: "failed", error: "file is required" });
  }

  // -------- helper: run the full pipeline once --------
  const runPipeline = async () => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mimeType = (mime.lookup(ext) || file.mimetype || "").toString();

    let extracted = "";
    let transcript;

    if (mimeType.includes("video") || ext === ".mp4") {
      transcript = await transcribeMp4(file.path);
      extracted = transcript || "";
    } else if (ext === ".pdf" || mimeType === "application/pdf") {
      extracted = await extractFromPdf(file.path);
    } else if (
      [".jpg", ".jpeg", ".png"].includes(ext) ||
      (mimeType && mimeType.startsWith("image/"))
    ) {
      extracted = await ocrImage(file.path);
    } else {
      throw new Error(`Unsupported file type: ${ext || mimeType}`);
    }

    if (!extracted || extracted.trim().length < 20) {
      throw new Error(
        "No readable text found. (If this is a scanned PDF, convert to images or use OCR API.)"
      );
    }

    const summary = await summarizeText(extracted);

    const payload = {
      status: "succeeded",
      abstract: summary.abstract,
      bullets: summary.bullets,
      quotes: summary.quotes,
      ...(transcript ? { transcript } : {}),
    };

    return payload;
  };

  // -------- SYNC mode (no callbackUrl): return summary directly --------
  if (!callbackUrl) {
    try {
      const payload = await runPipeline();
      res.json(payload);
    } catch (e) {
      const msg = typeof e?.message === "string" ? e.message : String(e);
      res.status(500).json({ status: "failed", error: msg });
    } finally {
      fs.unlink(file.path, () => {});
    }
    return;
  }

  // -------- ASYNC mode (callbackUrl provided): acknowledge and post later --------
  try {
    // respond fast so the client can continue
    res.json({ status: "received" });

    const payload = await runPipeline();

    await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const msg = typeof e?.message === "string" ? e.message : String(e);
    try {
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed", error: msg }),
      });
    } catch {}
  } finally {
    fs.unlink(file.path, () => {});
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log("Agent listening on :" + PORT));
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
app.use(express.json({ limit: "5mb" }));

// store uploads on disk (ok for Render free)
const upload = multer({ dest: "uploads/" });

// health
app.get("/", (_, res) =>
  res.json({ ok: true, service: "summarizer-agent", mode: "sync-or-async" })
);

/**
 * /process
 * - If body has callbackUrl => ASYNC mode (immediate 200 + later POST to callback)
 * - If no callbackUrl => SYNC mode (hold connection and return the summary JSON directly)
 */
app.post("/process", upload.single("file"), async (req, res) => {
  const file = req.file;
  const callbackUrl = req.body?.callbackUrl;

  if (!file) {
    return res.status(400).json({ status: "failed", error: "file is required" });
  }

  // -------- helper: run the full pipeline once --------
  const runPipeline = async () => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mimeType = (mime.lookup(ext) || file.mimetype || "").toString();

    let extracted = "";
    let transcript;

    if (mimeType.includes("video") || ext === ".mp4") {
      transcript = await transcribeMp4(file.path);
      extracted = transcript || "";
    } else if (ext === ".pdf" || mimeType === "application/pdf") {
      extracted = await extractFromPdf(file.path);
    } else if (
      [".jpg", ".jpeg", ".png"].includes(ext) ||
      (mimeType && mimeType.startsWith("image/"))
    ) {
      extracted = await ocrImage(file.path);
    } else {
      throw new Error(`Unsupported file type: ${ext || mimeType}`);
    }

    if (!extracted || extracted.trim().length < 20) {
      throw new Error(
        "No readable text found. (If this is a scanned PDF, convert to images or use OCR API.)"
      );
    }

    const summary = await summarizeText(extracted);

    const payload = {
      status: "succeeded",
      abstract: summary.abstract,
      bullets: summary.bullets,
      quotes: summary.quotes,
      ...(transcript ? { transcript } : {}),
    };

    return payload;
  };

  // -------- SYNC mode (no callbackUrl): return summary directly --------
  if (!callbackUrl) {
    try {
      const payload = await runPipeline();
      res.json(payload);
    } catch (e) {
      const msg = typeof e?.message === "string" ? e.message : String(e);
      res.status(500).json({ status: "failed", error: msg });
    } finally {
      fs.unlink(file.path, () => {});
    }
    return;
  }

  // -------- ASYNC mode (callbackUrl provided): acknowledge and post later --------
  try {
    // respond fast so the client can continue
    res.json({ status: "received" });

    const payload = await runPipeline();

    await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const msg = typeof e?.message === "string" ? e.message : String(e);
    try {
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed", error: msg }),
      });
    } catch {}
  } finally {
    fs.unlink(file.path, () => {});
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log("Agent listening on :" + PORT));
