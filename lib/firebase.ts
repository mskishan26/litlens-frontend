import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
    getAuth,
    GoogleAuthProvider,
    signInAnonymously,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    linkWithCredential,
    EmailAuthProvider,
    type User,
    type Auth,
} from "firebase/auth";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Lazy initialization for client-side only
let app: FirebaseApp | undefined;
let auth: Auth | undefined;

const getFirebaseApp = (): FirebaseApp => {
    if (typeof window === "undefined") {
        throw new Error("Firebase can only be initialized on the client side");
    }
    if (!app) {
        app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    }
    return app;
};

const getFirebaseAuth = (): Auth => {
    if (!auth) {
        auth = getAuth(getFirebaseApp());
    }
    return auth;
};

// Providers
const googleProvider = new GoogleAuthProvider();

export {
    getFirebaseAuth,
    googleProvider,
    signInAnonymously,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    firebaseSignOut,
    linkWithCredential,
    EmailAuthProvider,
    type User,
};
