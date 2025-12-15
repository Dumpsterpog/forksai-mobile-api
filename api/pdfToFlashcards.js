import formidable from "formidable";
import fs from "fs";
import { createRequire } from "module";
import { db } from "./firebaseAdmin.js";
import admin from "firebase-admin";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    /* ---------- PARSE MULTIPART FORM ---------- */
    const form = formidable({ multiples: false });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fl) => {
        if (err) reject(err);
        else resolve({ fields: f, files: fl });
      });
    });

    /* ---------- USER ID ---------- */
    const userId = Array.isArray(fields.userId)
      ? fields.userId[0]
      : typeof fields.userId === "object"
      ? Object.values(fields.userId)[0]
      : fields.userId;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "Invalid or missing userId" });
    }

    /* ---------- FILE ---------- */
    let file = files.file;
    if (!file) {
      return res.status(400).json({ error: "Missing PDF file" });
    }
    if (Array.isArray(file)) file = file[0];

    /* ---------- READ PDF ---------- */
    const buffer = await fs.promises.readFile(file.filepath);

    let notes = "";
    try {
      const pdf = await pdfParse(buffer);
      notes = pdf?.text || "";
    } catch {
      return res.status(400).json({
        error: "This PDF cannot be read. Please upload a text-based PDF.",
      });
    }

    const MAX_CHARS = 12000;
    notes = notes.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);

    console.log("PDF TEXT LENGTH:", notes.length);

    if (notes.length < 200) {
      return res.status(400).json({
        error:
          "We couldn’t extract readable text from this PDF. Please upload a text-based PDF.",
        flashcards: [],
      });
    }

    /* ---------- SETTINGS ---------- */
    const difficulty = fields.difficulty || "medium";
    const limit = Math.min(
      50,
      Math.max(1, parseInt(fields.limit || "12", 10))
    );

    /* ---------- GEMINI FLASHCARDS ---------- */
    const prompt = `
Convert the following text into ${limit} flashcards.
Difficulty: ${difficulty}

Return ONLY valid JSON:
[
  { "q": "Question", "a": "Answer" }
]

Text:
${notes}
`;

    // ✅ CORRECT MODEL + API
    const model = "gemini-2.0-flash";

    const result = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await result.json();
    console.log("GEMINI FULL RESPONSE:", JSON.stringify(data));

    if (data.error) {
      return res.status(500).json({
        error: data.error.message || "Gemini API error",
        flashcards: [],
      });
    }

    if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
      return res.status(500).json({
        error: "Gemini returned no candidates.",
        flashcards: [],
      });
    }

    const parts = data.candidates[0]?.content?.parts;

    if (!Array.isArray(parts)) {
      return res.status(500).json({
        error: "Gemini returned no content parts.",
        flashcards: [],
      });
    }

    const raw = parts
      .map((p) => p.text)
      .filter(Boolean)
      .join("\n")
      .trim();

    console.log("GEMINI RAW OUTPUT:", raw);

    if (!raw) {
      return res.status(500).json({
        error: "Gemini returned empty output.",
        flashcards: [],
      });
    }

    let flashcards;
    try {
      flashcards = JSON.parse(
        raw.replace(/```json/g, "").replace(/```/g, "").trim()
      );
    } catch {
      return res.status(500).json({
        error: "AI returned invalid JSON.",
        flashcards: [],
      });
    }

    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      return res.status(500).json({
        error: "AI returned no flashcards.",
        flashcards: [],
      });
    }

    /* ---------- GENERATE TITLE ---------- */
    const titlePrompt = `
Create a short, clear study deck title.
Return ONLY the title text.

${notes.slice(0, 300)}
`;

    const tRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: titlePrompt }] }],
        }),
      }
    );

    const tJson = await tRes.json();
    const title =
      tJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "Untitled Deck";

    /* ---------- SAVE TO FIRESTORE ---------- */
    const deckRef = await db.collection("flashcardDecks").add({
      userId,
      title,
      difficulty,
      source: "PDF",
      sourceType: "pdf",
      flashcards,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      deckId: deckRef.id,
      title,
      flashcards,
    });
  } catch (err) {
    console.error("PDF flashcards error:", err);
    return res.status(500).json({
      error: "Failed to generate flashcards from PDF.",
    });
  }
}
