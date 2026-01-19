import { NextRequest } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';

const BACKEND_BASE_URL = "https://mskishan26--litlens-backend-ragservice-web-app.modal.run";
const SERVICE_TOKEN = process.env.RAG_BACKEND_SERVICE_TOKEN || "dev-secret-123";

export async function GET(
    req: NextRequest,
    context: { params: { chatId: string } }
) {
    try {
        const params = await context.params;
        const chatId = params.chatId;

        // Verify authentication
        const authHeader = req.headers.get('authorization');
        const isAnonymous = req.headers.get('x-user-anonymous') || 'false';

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

        // Call backend messages endpoint
        const response = await fetch(
            `${BACKEND_BASE_URL}/chats/${chatId}/messages`,
            {
                method: 'GET',
                headers: {
                    'X-Service-Token': SERVICE_TOKEN,
                    'X-User-Id': userId,
                    'X-User-Anonymous': isAnonymous,
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            return new Response(errorText, { status: response.status });
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('[Messages API] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
