import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "forksai.firebasestorage.app"
  });
}

export const db = admin.firestore();
export const storage = admin.storage();
