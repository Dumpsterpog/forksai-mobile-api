import { db } from "./firebaseAdmin.js";

export default async function handler(req, res) {
  try {
    const { deckId } = req.query;

    if (!deckId) {
      return res.status(400).json({ error: "Missing deckId" });
    }

    /* 1️⃣ TRY AI DECK */
    let doc = await db.collection("flashcardDecks").doc(deckId).get();

    if (doc.exists) {
      const data = doc.data();

      return res.status(200).json({
        deckId: doc.id,
        type: "ai",
        title: data.title || "Untitled Deck",
        cards: (data.flashcards || []).map((c) => ({
          question: c.q || c.question || "",
          answer: c.a || c.answer || "",
        })),
      });
    }

    /* 2️⃣ TRY MANUAL DECK */
    doc = await db.collection("flashcards").doc(deckId).get();

    if (doc.exists) {
      const data = doc.data();

      return res.status(200).json({
        deckId: doc.id,
        type: "manual",
        title: data.title || "Untitled Deck",
        cards: (data.cards || []).map((c) => ({
          question: c.front || c.question || "",
          answer: c.back || c.answer || "",
        })),
      });
    }

    /* 3️⃣ NOT FOUND */
    return res.status(404).json({
      error: "Deck not found",
    });

  } catch (err) {
    console.error("getFlashcards error:", err);
    return res.status(500).json({
      error: "Failed to fetch deck",
    });
  }
}
