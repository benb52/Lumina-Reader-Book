import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC5FaUSrbQtTUZw3RfyolFi6q7IYFHUmSc",
  authDomain: "luminareader-6f3a2.firebaseapp.com",
  projectId: "luminareader-6f3a2",
  storageBucket: "luminareader-6f3a2.firebasestorage.app",
  messagingSenderId: "690755656263",
  appId: "1:690755656263:web:0028e051593acbf42caf62",
  measurementId: "G-M1V48EJH5P"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
