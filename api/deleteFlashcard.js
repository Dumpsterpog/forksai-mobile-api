import { db } from "./firebaseAdmin.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(400).json({ error: "Invalid method" });
    }

    const { deckId, index } = req.body;

    if (!deckId || index === undefined) {
      return res.status(400).json({ error: "Missing deckId or index" });
    }

    const deckRef = db.collection("flashcardDecks").doc(deckId);
    const docSnap = await deckRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: "Deck not found" });
    }

    const deckData = docSnap.data();
    const flashcards = deckData.flashcards || [];

    if (index < 0 || index >= flashcards.length) {
      return res.status(400).json({ error: "Invalid flashcard index" });
    }

    // Remove the card
    flashcards.splice(index, 1);

    // Update Firestore
    await deckRef.update({ flashcards });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
