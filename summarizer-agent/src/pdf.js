import fs from "fs";
import pdf from "pdf-parse";

export async function extractFromPdf(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const parsed = await pdf(dataBuffer);
  const text = (parsed.text || "").trim();
  return text;
}
