import { Assistant } from "../../assistant";

interface PageProps {
    params: Promise<{ chatId: string }>;
}

export default async function ChatPage({ params }: PageProps) {
    const { chatId } = await params;
    return <Assistant chatId={chatId} />;
}
