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
const upload = multer({ dest: "uploads/" });

app.get("/", (_, res) => res.json({ ok: true, service: "summarizer-agent" }));

app.post("/process", upload.single("file"), async (req, res) => {
  const file = req.file;
  const callbackUrl = req.body?.callbackUrl;
  if (!file) return res.status(400).json({ error: "file is required" });
  if (!callbackUrl) return res.status(400).json({ error: "callbackUrl is required" });

  res.json({ status: "received" }); // respond fast

  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = mime.lookup(ext) || file.mimetype || "";

  try {
    let extracted = "";
    let transcript;

    if (mimeType.includes("video") || ext === ".mp4") {
      transcript = await transcribeMp4(file.path);
      extracted = transcript || "";
    } else if (ext === ".pdf" || mimeType === "application/pdf") {
      extracted = await extractFromPdf(file.path);
    } else if ([".jpg", ".jpeg", ".png"].includes(ext) || (mimeType && mimeType.startsWith("image/"))) {
      extracted = await ocrImage(file.path);
    } else {
      throw new Error(`Unsupported file type: ${ext || mimeType}`);
    }

    if (!extracted || extracted.trim().length < 20) {
      throw new Error("No readable text found. (If this is a scanned PDF, convert to images or use OCR API.)");
    }

    const summary = await summarizeText(extracted);

    const payload = {
      status: "succeeded",
      abstract: summary.abstract,
      bullets: summary.bullets,
      quotes: summary.quotes,
      ...(transcript ? { transcript } : {}),
    };

    await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const errMsg = typeof e?.message === "string" ? e.message : String(e);
    try {
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed", error: errMsg }),
      });
    } catch {}
  } finally {
    fs.unlink(file.path, () => {});
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log("Agent listening on :" + PORT));
