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

    const userId = fields.userId;
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

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

    // 🔒 HARD LIMIT (prevents serverless crash)
    const MAX_CHARS = 12000;
    notes = notes.replace(/\s+/g, " ").slice(0, MAX_CHARS);

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

    const model = "gemini-2.5-flash";

    const result = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await result.json();
    const raw =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    let flashcards;
    try {
      flashcards = JSON.parse(
        raw.replace(/```json/g, "").replace(/```/g, "").trim()
      );
    } catch {
      flashcards = [
        { q: "Error", a: "AI returned invalid output." },
      ];
    }

    if (!Array.isArray(flashcards)) {
      flashcards = [
        { q: "Error", a: "Invalid flashcard format." },
      ];
    }

    /* ---------- GENERATE TITLE ---------- */
    const titlePrompt = `
Create a short, clear study deck title.
Return ONLY the title text.

${notes.slice(0, 300)}
`;

    const tRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
