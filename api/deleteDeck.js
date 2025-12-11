import { db } from "./firebaseAdmin.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(400).json({ error: "Invalid method" });
    }

    const { deckId, source } = req.body;

    if (!deckId) {
      return res.status(400).json({ error: "Missing deckId" });
    }

    const ref =
      source === "manual"
        ? db.collection("flashcards").doc(deckId)
        : db.collection("flashcardDecks").doc(deckId);

    await ref.delete();

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
