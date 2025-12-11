import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY)),
    storageBucket: "forksai.firebasestorage.app",
  });
}

export const db = admin.firestore();
export const storage = admin.storage();
