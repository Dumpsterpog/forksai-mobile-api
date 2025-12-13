import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY)),
    storageBucket: "forksai.appspot.com",
  });
}

export default async function handler(req, res) {
  try {
    const { base64, uid } = req.body;

    if (!base64 || !uid) {
      return res.status(400).json({ error: "Missing data" });
    }

    const buffer = Buffer.from(base64, "base64");
    const bucket = getStorage().bucket();

    const filePath = `flashcards/${uid}/${Date.now()}.jpg`;
    const file = bucket.file(filePath);

    await file.save(buffer, {
      contentType: "image/jpeg",
      public: true,
    });

    const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    return res.json({ url });
  } catch (err) {
    console.error("UPLOAD ERROR", err);
    return res.status(500).json({ error: "Upload failed" });
  }
}
