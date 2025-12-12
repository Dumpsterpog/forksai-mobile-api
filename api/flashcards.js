import { db } from "./firebaseAdmin.js";
import admin from "firebase-admin";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userId, notes, difficulty = "medium", limit = 12 } = req.body;

    if (!userId) return res.status(400).json({ error: "Missing userId" });
    if (!notes || !notes.trim())
      return res.status(400).json({ error: "Notes required" });

    const allowed = ["easy", "medium", "hard"];
    const diff = allowed.includes(difficulty) ? difficulty : "medium";
    const cardLimit = parseInt(limit) || 12;

    const prompt = `
Turn the following notes into exactly ${cardLimit} flashcards.
Difficulty: ${diff}
Return JSON only: [ { "q": "", "a": "" } ]

Notes:
${notes}
`;

    // Call Gemini
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
      flashcards = [{ q: "Error", a: "Unable to parse Gemini response" }];
    }

    // Auto-generate title
    const titlePrompt = `
Extract a short title for these notes. Only return the title text.

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
      difficulty: diff,
      source: "text",
      flashcards,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      deckId: deckRef.id,
      flashcards,
      title,
    });
  } catch (err) {
    console.error("Flashcards API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
