
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Loader2, Send, User, ExternalLink, KeyRound, Eraser, TriangleAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { askBob, removeApiKey } from '@/ai/flows/ask-bob-flow';
import { AskBobInput } from '@/lib/types';
import { BobSetupGuide } from '@/app/components/bob-setup-guide';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

type ChatMessage = {
    role: 'user' | 'model';
    content: string;
};

const CHAT_HISTORY_KEY = 'bob-chat-history';

function getApiKey(): string | null {
    try {
        return localStorage.getItem('gemini-api-key');
    } catch {
        return null;
    }
}

function getChatHistory(): ChatMessage[] {
    try {
        const stored = localStorage.getItem(CHAT_HISTORY_KEY);
        if (!stored) return [];
        return JSON.parse(stored) as ChatMessage[];
    } catch {
        return [];
    }
}

function saveChatHistory(messages: ChatMessage[]) {
    try {
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
    } catch {
        // Storage full or unavailable — silently ignore
    }
}

function clearChatHistory() {
    localStorage.removeItem(CHAT_HISTORY_KEY);
}

interface BobChatInterfaceProps {
  initialMessage?: string;
  showLinkToFullPage?: boolean;
}

export function BobChatInterface({ initialMessage, showLinkToFullPage = false }: BobChatInterfaceProps) {
    const { toast } = useToast();
    const [conversation, setConversation] = useState<ChatMessage[]>(() => {
        // Load persisted history on mount, or fall back to initial greeting
        if (typeof window === 'undefined') return [];
        const saved = getChatHistory();
        if (saved.length > 0) return saved;
        if (initialMessage) return [{ role: 'model' as const, content: initialMessage }];
        return [];
    });
    const [message, setMessage] = useState('');
    const [isPending, setIsPending] = useState(false);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [hasApiKey, setHasApiKey] = useState(() => {
        if (typeof window === 'undefined') return false;
        return !!getApiKey();
    });

    // Scroll the chat viewport to the bottom
    const scrollToBottom = () => {
        requestAnimationFrame(() => {
            const vp = viewportRef.current;
            if (vp) vp.scrollTop = vp.scrollHeight;
        });
    };

    // Scroll to bottom on mount (so the user sees the most recent messages)
    useEffect(() => {
        scrollToBottom();
    }, []);

    // Scroll to bottom whenever conversation changes or loading state changes
    useEffect(() => {
        scrollToBottom();
    }, [conversation, isPending]);

    // Persist conversation to localStorage whenever it changes
    useEffect(() => {
        if (conversation.length > 0) {
            saveChatHistory(conversation);
        }
    }, [conversation]);

    // Listen for storage events so the popover and full page stay in sync
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === CHAT_HISTORY_KEY && e.newValue) {
                try {
                    const updated = JSON.parse(e.newValue) as ChatMessage[];
                    setConversation(updated);
                } catch { /* ignore parse errors */ }
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    if (!hasApiKey) {
        return <BobSetupGuide onKeyConfigured={() => setHasApiKey(true)} />;
    }

    const handleDisconnect = () => {
        removeApiKey();
        clearChatHistory();
        setConversation([]);
        setHasApiKey(false);
    };

    const handleClearChat = () => {
        clearChatHistory();
        const fresh: ChatMessage[] = initialMessage
            ? [{ role: 'model', content: initialMessage }]
            : [];
        setConversation(fresh);
        saveChatHistory(fresh);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        const userMessage: ChatMessage = { role: 'user', content: message };
        const updatedHistory = [...conversation, userMessage];
        setConversation(updatedHistory);

        const currentQuestion = message;
        setMessage('');

        setIsPending(true);
        try {
            const flowInput: AskBobInput = {
                history: updatedHistory,
                question: currentQuestion,
            };
            const response = await askBob(flowInput);
            const bobMessage: ChatMessage = { role: 'model', content: response };
            setConversation(prev => [...prev, bobMessage]);
        } catch (error: any) {
            console.error("AI Error:", error);
            const errorMessage: ChatMessage = {
                role: 'model',
                content: error?.message || "Sorry, I ran into an unexpected error. Please try again."
            };
            setConversation(prev => [...prev, errorMessage]);
            toast({
                variant: "destructive",
                title: "AI Error",
                description: error?.message || "Could not get a response from the assistant.",
            });
        } finally {
            setIsPending(false);
        }
    };


    return (
        <div className="flex flex-col h-full">
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 mb-3 text-xs text-amber-600 dark:text-amber-400">
                <TriangleAlert className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span><strong>Bob is for inheritance planning &amp; app support only.</strong> Never enter seed phrases, passwords, private keys, or any sensitive data — your messages are sent to Google&apos;s Gemini API.</span>
            </div>
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
                            chat.role === 'user'
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted dark:bg-[#4a4446]"
                        )}>
                            <ReactMarkdown
                              rehypePlugins={[rehypeSanitize]}
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
                        <div className="max-w-sm p-3 rounded-lg bg-muted dark:bg-[#4a4446]">
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
                <Button type="submit" size="icon" disabled={isPending || !message.trim()} className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md flex-shrink-0">
                    <Send className="h-5 w-5" />
                </Button>
            </form>
            <div className="flex items-center justify-center gap-3 mt-2">
                {showLinkToFullPage && (
                    <Button variant="link" asChild size="sm">
                        <Link href="/support">
                           Open in full page
                           <ExternalLink className="ml-2 h-4 w-4"/>
                        </Link>
                    </Button>
                )}
                {!showLinkToFullPage && (
                    <Button
                        variant="link"
                        size="sm"
                        onClick={handleClearChat}
                        disabled={conversation.length <= 1}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <Eraser className="mr-1 h-3 w-3" />
                        Clear Chat
                    </Button>
                )}
                <Button
                    variant="link"
                    size="sm"
                    onClick={handleDisconnect}
                    className="text-muted-foreground hover:text-destructive"
                >
                    <KeyRound className="mr-1 h-3 w-3" />
                    Remove API Key
                </Button>
            </div>
        </div>
    );
}
