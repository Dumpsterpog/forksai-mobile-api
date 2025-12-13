import { db } from "./firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { deckId, index, type } = req.body;

    if (!deckId || index === undefined) {
      return res.status(400).json({ error: "Missing data" });
    }

    const collection =
      type === "manual" ? "flashcards" : "flashcardDecks";

    const ref = db.collection(collection).doc(deckId);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Deck not found" });
    }

    const data = snap.data();
    const cards = data.flashcards || [];

    cards.splice(index, 1);

    await ref.update({ flashcards: cards });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Delete flashcard error:", err);
    return res.status(500).json({ error: "Failed to delete card" });
  }
}
