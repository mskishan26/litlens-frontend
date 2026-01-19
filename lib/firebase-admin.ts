import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * Firebase Admin SDK for server-side authentication verification.
 * This runs ONLY on the server (API routes) and verifies ID tokens.
 */

let adminApp: App | undefined;

export const getFirebaseAdmin = (): App => {
    if (adminApp) {
        return adminApp;
    }

    // Check if already initialized
    const existingApps = getApps();
    if (existingApps.length > 0) {
        adminApp = existingApps[0];
        return adminApp;
    }

    // Initialize with service account credentials
    // For production, use service account JSON
    // For development, you can use project ID only (less secure but simpler)
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!projectId) {
        throw new Error('Firebase project ID not configured');
    }

    // If you have a service account key, use it (recommended for production)
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        adminApp = initializeApp({
            credential: cert({
                projectId,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Private key needs newlines restored
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
    } else {
        // Fallback: Use Application Default Credentials (works in Firebase/GCP environments)
        // Or just project ID for local development (tokens still verified via Firebase API)
        adminApp = initializeApp({
            projectId,
        });
    }

    return adminApp;
};

export const getFirebaseAdminAuth = (): Auth => {
    const app = getFirebaseAdmin();
    return getAuth(app);
};

/**
 * Verify a Firebase ID token and return the decoded token with user info.
 * This is the SECURE way to verify a user's identity on the server.
 * 
 * @param idToken - The Firebase ID token from the Authorization header
 * @returns Decoded token containing uid, email, etc.
 * @throws Error if token is invalid or expired
 */
export const verifyIdToken = async (idToken: string) => {
    const auth = getFirebaseAdminAuth();
    return await auth.verifyIdToken(idToken);
};
