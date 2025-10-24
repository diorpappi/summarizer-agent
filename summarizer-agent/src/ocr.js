import Tesseract from "tesseract.js";

// Add additional languages like 'eng+sq' if you've installed them
export async function ocrImage(imagePath, lang = "eng") {
  const res = await Tesseract.recognize(imagePath, lang);
  return res.data.text || "";
}
