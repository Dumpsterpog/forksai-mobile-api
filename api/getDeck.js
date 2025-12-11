import { db } from "./firebaseAdmin.js";

export default async function handler(req, res) {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing deck id" });

    const doc = await db.collection("flashcards").doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Deck not found" });

    return res.status(200).json({ deck: { id: doc.id, ...doc.data() } });
  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
