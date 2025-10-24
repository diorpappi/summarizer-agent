import fetch from "node-fetch";

export async function summarizeText(text) {
  const clipped = text.slice(0, 200000); // safety cap
  const prompt = `You are a precise summarizer. Produce:\n
1) Abstract (3–5 sentences)\n
2) 7–12 key bullets (<=16 words each)\n
3) 2–3 memorable quotes (verbatim if present)\n
Text:\n${clipped}`;

  const model = "gpt-4o-mini";

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || "LLM summarize failed");

  const content = data.choices?.[0]?.message?.content || "";

  const abstractMatch = content.match(/Abstract[:\s\n]*([\s\S]*?)(?:\n\n|$)/i);
  const abstract = (abstractMatch ? abstractMatch[1] : content).trim();

  const bullets = content
    .split(/\n/)
    .filter(l => /^\s*[-•]/.test(l))
    .map(l => l.replace(/^\s*[-•]\s*/, "").trim())
    .slice(0, 12);

  const quotes = content
    .split(/\n/)
    .filter(l => /["“”]/.test(l))
    .slice(0, 3);

  return { abstract, bullets, quotes };
}
