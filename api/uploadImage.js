import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { base64, uid } = req.body;

    if (!base64 || !uid) {
      return res.status(400).json({ error: "Missing base64 or uid" });
    }

    const buffer = Buffer.from(base64, "base64");
    const bucket = getStorage().bucket();

    const filePath = `flashcards/${uid}/${Date.now()}.jpg`;
    const file = bucket.file(filePath);

    await file.save(buffer, {
      metadata: { contentType: "image/jpeg" },
      public: true,
      resumable: false,
    });

    const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    return res.status(200).json({ url });
  } catch (err) {
    console.error("UPLOAD ERROR", err);
    return res.status(500).json({ error: "Upload failed" });
  }
}
