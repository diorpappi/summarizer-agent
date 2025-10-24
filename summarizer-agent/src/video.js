import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import { Readable } from "stream";
import FormData from "form-data";
import fetch from "node-fetch";

ffmpeg.setFfmpegPath(ffmpegPath);

export async function transcribeMp4(mp4Path) {
  const wavPath = mp4Path + ".wav";
  await new Promise((resolve, reject) => {
    ffmpeg(mp4Path)
      .audioChannels(1)
      .audioFrequency(16000)
      .toFormat("wav")
      .on("end", resolve)
      .on("error", reject)
      .save(wavPath);
  });

  const form = new FormData();
  form.append("file", fs.createReadStream(wavPath), { filename: "audio.wav", contentType: "audio/wav" });
  form.append("model", "whisper-1");

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  const data = await resp.json();
  try { fs.unlinkSync(wavPath); } catch {}
  if (!resp.ok) {
    throw new Error(data?.error?.message || "Whisper API failed");
  }
  return data.text || "";
}
