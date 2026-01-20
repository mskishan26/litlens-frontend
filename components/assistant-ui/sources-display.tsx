import { FC } from "react";
import { ShieldCheckIcon, ShieldAlertIcon } from "lucide-react";
import { useMessage } from "@assistant-ui/react";
import { cn } from "@/lib/utils";

export const SourcesDisplay: FC = () => {
    const message = useMessage();
    // Check both metadata.custom (for loaded history) and metadata root (for streaming)
    const metadata = message.metadata as any;
    const sources = metadata?.custom?.sources || metadata?.sources;
    const hallucination = metadata?.custom?.hallucination ?? metadata?.hallucination;

    if (!sources && hallucination === undefined) return null;

    return (
        <div className="mt-3 space-y-2 text-xs">
            {hallucination !== undefined && (
                <div className={cn("flex items-center gap-1.5 font-medium", hallucination ? "text-destructive" : "text-green-600")}>
                    {hallucination ? (
                        <>
                            <ShieldAlertIcon className="size-3.5" />
                            <span>Potential Hallucination Detected</span>
                        </>
                    ) : (
                        <>
                            <ShieldCheckIcon className="size-3.5" />
                            <span>Verified (No Hallucination)</span>
                        </>
                    )}
                </div>
            )}

            {sources && Array.isArray(sources) && sources.length > 0 && (
                <div className="rounded-md bg-muted/50 p-2.5">
                    <div className="font-semibold mb-1.5 opacity-90">Sources</div>
                    <ul className="space-y-1.5 text-muted-foreground">
                        {sources.map((src: any, i: number) => {
                            // Extract title/url if object, or use string
                            const text = typeof src === 'string' ? src : (src.title || src.url || JSON.stringify(src));
                            const url = typeof src === 'object' ? src.url : null;

                            return (
                                <li key={i} className="flex items-start gap-1.5">
                                    <span className="opacity-50 mt-1">•</span>
                                    {url ? (
                                        <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary truncate block">
                                            {text}
                                        </a>
                                    ) : (
                                        <span className="truncate block">{text}</span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
};
