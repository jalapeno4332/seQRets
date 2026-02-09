import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Loader2, Send, User, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { askBob, getApiKey } from '@/lib/bob-api';
import { BobSetupGuide } from '@/components/bob-setup-guide';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

type ChatMessage = {
    role: 'user' | 'model';
    content: string;
};

interface BobChatInterfaceProps {
  initialMessage?: string;
  showLinkToFullPage?: boolean;
}

export function BobChatInterface({ initialMessage, showLinkToFullPage = false }: BobChatInterfaceProps) {
    const { toast } = useToast();
    const [conversation, setConversation] = useState<ChatMessage[]>([]);
    const [message, setMessage] = useState('');
    const [isPending, setIsPending] = useState(false);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [hasApiKey, setHasApiKey] = useState(() => !!getApiKey());

    if (!hasApiKey) {
        return <BobSetupGuide onKeyConfigured={() => setHasApiKey(true)} />;
    }

    useEffect(() => {
        if (initialMessage && conversation.length === 0) {
            setConversation([{ role: 'model', content: initialMessage }]);
        }
    }, [initialMessage, conversation.length]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        const userMessage: ChatMessage = { role: 'user', content: message };
        setConversation(prev => [...prev, userMessage]);

        const currentQuestion = message;
        setMessage('');

        setIsPending(true);
        try {
            const response = await askBob(conversation, currentQuestion);
            const bobMessage: ChatMessage = { role: 'model', content: response };
            setConversation(prev => [...prev, bobMessage]);
        } catch (error) {
            console.error("AI Error:", error);
            const errorMessage: ChatMessage = { role: 'model', content: "Sorry, I ran into an unexpected error. Please try again." };
            setConversation(prev => [...prev, errorMessage]);
            toast({
                variant: "destructive",
                title: "AI Error",
                description: "Could not get a response from the assistant.",
            });
        } finally {
            setIsPending(false);
        }
    };


    return (
        <div className="flex flex-col h-full">
            <ScrollArea className="flex-grow h-0 pr-4" viewportRef={viewportRef}>
                <div className="space-y-6">
                {conversation.map((chat, index) => (
                    <div key={index} className={cn("flex items-start gap-3", chat.role === 'user' && "justify-end")}>
                        {chat.role === 'model' && (
                            <Avatar className="h-8 w-8">
                                <AvatarFallback><Bot size={20}/></AvatarFallback>
                            </Avatar>
                        )}
                        <div className={cn("max-w-sm p-3 rounded-lg text-sm",
                            chat.role === 'user' ? "bg-primary text-white" : "bg-muted"
                        )}>
                            <ReactMarkdown
                              components={{
                                  p: ({node, ...props}) => <p className="text-sm" {...props} />,
                                  ol: ({node, ...props}) => <ol className="list-decimal space-y-1 pl-4" {...props} />,
                                  ul: ({node, ...props}) => <ul className="list-disc space-y-1 pl-4" {...props} />,
                                  li: ({node, ...props}) => <li className="text-sm" {...props} />,
                              }}
                            >
                                {chat.content}
                            </ReactMarkdown>
                        </div>
                            {chat.role === 'user' && (
                            <Avatar className="h-8 w-8">
                                <AvatarFallback><User size={20}/></AvatarFallback>
                            </Avatar>
                        )}
                    </div>
                ))}
                    {isPending && (
                    <div className="flex items-start gap-3">
                            <Avatar className="h-8 w-8">
                            <AvatarFallback><Bot size={20}/></AvatarFallback>
                        </Avatar>
                        <div className="max-w-sm p-3 rounded-lg bg-muted">
                            <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                    </div>
                )}
                </div>
            </ScrollArea>
             <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-4 border-t mt-4">
                <Input
                    id="message"
                    placeholder="Ask Bob about security or inheritance..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={isPending}
                    autoComplete="off"
                />
                <Button type="submit" size="icon" disabled={isPending || !message.trim()} className="text-white bg-gradient-to-r from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600 flex-shrink-0">
                    <Send className="h-5 w-5" />
                </Button>
            </form>
            {showLinkToFullPage && (
                 <div className="text-center mt-2">
                    <Button variant="link" asChild size="sm">
                        <Link to="/support">
                           Open in full page
                           <ExternalLink className="ml-2 h-4 w-4"/>
                        </Link>
                    </Button>
                </div>
            )}
        </div>
    );
}
