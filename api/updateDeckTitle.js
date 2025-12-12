import { db } from "./firebaseAdmin.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, message: "Method not allowed" });
    }

    const { deckId, title } = req.body;

    if (!deckId || !title) {
      return res.status(400).json({
        success: false,
        message: "Missing deckId or title",
      });
    }

    const ref = db.collection("flashcards").doc(deckId);

    await ref.update({
      title,
      updatedAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Deck title updated",
    });

  } catch (err) {
    console.error("UPDATE TITLE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update title",
    });
  }
}
