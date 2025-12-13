import { db, storage } from "./firebaseAdmin.js";

export default async function handler(req, res) {
  try {
    const { userId, deckId } = req.query;

    // Must have either a userId OR a deckId
    if (!userId && !deckId) {
      return res
        .status(400)
        .json({ error: "Missing userId or deckId parameter" });
    }

    const results = [];

    //
    // 🔹 1. AI DECKS (flashcardDecks)
    //
    const aiCollection = db.collection("flashcardDecks");
    let aiSnapshot;

    if (deckId) {
      // Fetch only ONE deck by ID
      aiSnapshot = await aiCollection.doc(deckId).get();

      if (aiSnapshot.exists) {
        const data = aiSnapshot.data();

        // 🔥 ADD: dateKey
        const createdAt = data.createdAt?.toDate?.();
        const dateKey = createdAt
          ? `${createdAt.getFullYear()}-${String(
              createdAt.getMonth() + 1
            ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`
          : null;

        results.push({
          id: aiSnapshot.id,
          ...data,
          sourceType: "ai",
          dateKey, // ✅ added
        });
      }
    } else {
      // Fetch ALL decks for user
      aiSnapshot = await aiCollection.where("userId", "==", userId).get();

      aiSnapshot.forEach((doc) => {
        const data = doc.data();

        // 🔥 ADD: dateKey
        const createdAt = data.createdAt?.toDate?.();
        const dateKey = createdAt
          ? `${createdAt.getFullYear()}-${String(
              createdAt.getMonth() + 1
            ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`
          : null;

        results.push({
          id: doc.id,
          ...data,
          sourceType: "ai",
          dateKey, // ✅ added
        });
      });
    }

    //
    // 🔹 2. MANUAL DECKS (flashcards)
    //
    const manualCollection = db.collection("flashcards");
    let manualSnapshot;

    if (deckId) {
      manualSnapshot = await manualCollection.doc(deckId).get();

      if (manualSnapshot.exists) {
        const data = manualSnapshot.data();

        // 🔥 ADD: dateKey
        const createdAt = data.createdAt?.toDate?.();
        const dateKey = createdAt
          ? `${createdAt.getFullYear()}-${String(
              createdAt.getMonth() + 1
            ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`
          : null;

        // Fetch signed image URLs (UNCHANGED)
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
          id: manualSnapshot.id,
          ...data,
          sourceType: "manual",
          dateKey, // ✅ added
        });
      }
    } else {
      manualSnapshot = await manualCollection
        .where("userId", "==", userId)
        .get();

      for (const doc of manualSnapshot.docs) {
        const data = doc.data();

        // 🔥 ADD: dateKey
        const createdAt = data.createdAt?.toDate?.();
        const dateKey = createdAt
          ? `${createdAt.getFullYear()}-${String(
              createdAt.getMonth() + 1
            ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`
          : null;

        // Fetch signed image URLs (UNCHANGED)
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
          dateKey, // ✅ added
        });
      }
    }

    //
    // 🔹 Return results (one deck or all decks)
    //
    return res.status(200).json({ docs: results });
  } catch (err) {
    console.error("API ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
