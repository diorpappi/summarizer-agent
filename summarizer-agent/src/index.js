// ✅ Load environment variables before anything else
import 'dotenv/config';
import express from "express";
import multer from "multer";
import fs from "fs";
import summarizeFile from "./summarize.js";

const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = process.env.PORT || 8787;

// Root endpoint
app.get("/", (req, res) => {
  res.json({ ok: true, service: "summarizer-agent" });
});

// Main processing endpoint
app.post("/process", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const result = await summarizeFile(filePath);
    fs.unlinkSync(filePath); // delete uploaded file
    res.json({ status: "succeeded", ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "failed",
      error: err.message,
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Summarizer agent running on port ${PORT}`);
});
