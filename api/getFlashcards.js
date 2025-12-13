import admin from "firebase-admin";
import { db } from "./firebaseAdmin.js";

export default async function handler(req, res) {
  try {
    const { deckId } = req.query;

    if (!deckId) {
      return res.status(400).json({ error: "Missing deckId" });
    }

    /* 1️⃣ TRY AI DECKS FIRST */
    let doc = await db.collection("flashcardDecks").doc(deckId).get();

    if (doc.exists) {
      return res.status(200).json({
        docs: [
          {
            id: doc.id,
            type: "ai",
            ...doc.data(),
          },
        ],
      });
    }

    /* 2️⃣ TRY MANUAL DECKS */
    doc = await db.collection("flashcards").doc(deckId).get();

    if (doc.exists) {
      return res.status(200).json({
        docs: [
          {
            id: doc.id,
            type: "manual",
            ...doc.data(),
          },
        ],
      });
    }

    /* 3️⃣ NOT FOUND */
    return res.status(404).json({
      error: "Deck not found",
    });

  } catch (err) {
    console.error("GET FLASHCARDS ERROR:", err);
    return res.status(500).json({
      error: "Failed to fetch deck",
    });
  }
}
