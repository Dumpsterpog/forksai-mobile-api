import formidable from "formidable";
import fs from "fs";
import pdfParse from "pdf-parse";
import { db } from "./firebaseAdmin.js";
import admin from "firebase-admin";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const form = formidable({ multiples: false });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fl) => {
        if (err) reject(err);
        else resolve({ fields: f, files: fl });
      });
    });

    const userId = fields.userId;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    let file = files.file;
    if (!file) return res.status(400).json({ error: "Missing PDF file" });

    if (Array.isArray(file)) file = file[0];

    const buffer = await fs.promises.readFile(file.filepath);

    const pdf = await pdfParse(buffer);
    const notes = pdf?.text || "";

    const difficulty = fields.difficulty || "medium";
    const limit = parseInt(fields.limit || "12");

    const prompt = `
Convert the following PDF text into ${limit} flashcards.
Difficulty: ${difficulty}

Return JSON only: [ { "q": "", "a": "" } ]

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
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    let flashcards;
    try {
      flashcards = JSON.parse(
        raw.replace(/```json/g, "").replace(/```/g, "").trim()
      );
    } catch (e) {
      flashcards = [{ q: "Error", a: "Failed to parse Gemini output" }];
    }

    const titlePrompt = `
Make a short deck title for the PDF content. Only return title text:

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

    // Save deck
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
      flashcards,
      title,
    });
  } catch (err) {
    console.error("PDF flashcards error:", err);
    return res.status(500).json({ error: err.message });
  }
}
