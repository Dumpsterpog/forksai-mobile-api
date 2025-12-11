import { db, storage } from "./firebaseAdmin.js";

export default async function handler(req, res) {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const results = [];

    // --- AI DECKS ---
    const aiSnapshot = await db
      .collection("flashcardDecks")
      .where("userId", "==", userId)
      .get();

    aiSnapshot.forEach((doc) => {
      results.push({
        id: doc.id,
        ...doc.data(),
        sourceType: "ai",
      });
    });

    // --- MANUAL DECKS ---
    const manualSnapshot = await db
      .collection("flashcards")
      .where("userId", "==", userId)
      .get();

    for (const doc of manualSnapshot.docs) {
      const data = doc.data();

      if (Array.isArray(data.flashcards)) {
        data.flashcards = await Promise.all(
          data.flashcards.map(async (card) => {
            if (card.image) {
              try {
                const fileRef = storage.bucket().file(card.image);
                const [url] = await fileRef.getSignedUrl({
                  action: "read",
                  expires: "03-01-2030",
                });
                card.imageUrl = url;
              } catch {
                card.imageUrl = null;
              }
            }
            return card;
          })
        );
      }

      results.push({
        id: doc.id,
        ...data,
        sourceType: "manual",
      });
    }

    return res.status(200).json({ docs: results });
  } catch (err) {
    console.error("API ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
