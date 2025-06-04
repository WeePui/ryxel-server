import admin from "firebase-admin";

const serviceAccount = require("../../firebase.service-account.json");

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK initialized successfully");
  } catch (error) {
    console.error("Firebase Admin SDK initialization error:", error);
  }
}

export default admin;
