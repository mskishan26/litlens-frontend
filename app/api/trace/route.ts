import { NextRequest } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';

const BACKEND_BASE_URL = "https://mskishan26--litlens-backend-ragservice-web-app.modal.run";
const SERVICE_TOKEN = process.env.RAG_BACKEND_SERVICE_TOKEN || "dev-secret-123";

export async function GET(req: NextRequest) {
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

        // Get query params
        const url = new URL(req.url);
        const chatId = url.searchParams.get('chat_id');
        const messageId = url.searchParams.get('message_id');

        if (!chatId || !messageId) {
            return new Response(
                JSON.stringify({ error: 'Missing chat_id or message_id' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Call backend trace endpoint
        const response = await fetch(
            `${BACKEND_BASE_URL}/chats/${chatId}/messages/${messageId}/trace`,
            {
                method: 'GET',
                headers: {
                    'X-Service-Token': SERVICE_TOKEN,
                    'X-User-Id': userId,
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            return new Response(errorText, { status: response.status });
        }

        const trace = await response.json();
        return new Response(JSON.stringify(trace), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('[Trace API] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
