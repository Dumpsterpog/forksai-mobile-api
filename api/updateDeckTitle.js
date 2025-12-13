import { db } from "./firebaseAdmin.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        message: "Method not allowed",
      });
    }

    const { deckId, title, type } = req.body;

    if (!deckId || !title || !type) {
      return res.status(400).json({
        success: false,
        message: "Missing deckId, title, or type",
      });
    }

    if (type !== "ai" && type !== "manual") {
      return res.status(400).json({
        success: false,
        message: "Invalid deck type",
      });
    }

    const collectionName =
      type === "ai" ? "flashcardDecks" : "flashcards";

    const ref = db.collection(collectionName).doc(deckId);

    await ref.set(
      {
        title: title.trim(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return res.status(200).json({
      success: true,
      message: "Deck title updated",
    });

  } catch (err) {
    console.error("UPDATE TITLE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update title",
    });
  }
}
