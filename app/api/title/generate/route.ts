import { NextRequest } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';

const BACKEND_BASE_URL = "https://mskishan26--litlens-backend-ragservice-web-app.modal.run";
const SERVICE_TOKEN = process.env.RAG_BACKEND_SERVICE_TOKEN || "dev-secret-123";

export async function POST(req: NextRequest) {
    try {
        // Verify authentication
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const idToken = authHeader.split('Bearer ')[1];
        let userId: string;

        try {
            const decodedToken = await verifyIdToken(idToken);
            userId = decodedToken.uid;
        } catch {
            return new Response(
                JSON.stringify({ error: 'Invalid token' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const body = await req.json();
        const { chat_id, queries } = body;

        if (!chat_id || !queries || !Array.isArray(queries)) {
            return new Response(
                JSON.stringify({ error: 'Missing chat_id or queries' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Call backend generate-title endpoint
        const response = await fetch(
            `${BACKEND_BASE_URL}/chats/${chat_id}/generate-title`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Service-Token': SERVICE_TOKEN,
                    'X-User-Id': userId,
                },
                body: JSON.stringify({ queries: queries.slice(0, 3) }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            return new Response(errorText, { status: response.status });
        }

        const result = await response.json();
        return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('[Generate Title API] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
