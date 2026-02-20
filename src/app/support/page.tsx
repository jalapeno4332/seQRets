

'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Bot } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Header } from "../components/header";
import { useTheme } from "next-themes";
import { BobChatInterface } from '../components/bob-chat-interface';


export default function SupportPage() {
    const { resolvedTheme } = useTheme();
    const logoSrc = resolvedTheme === 'dark' ? '/icons/logo-dark.png' : '/icons/logo-light.png';

    return (
        <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12">
            <div className="w-full max-w-4xl mx-auto relative flex flex-col h-[calc(100vh-6rem)]">
                <div className="absolute top-4 left-4 z-50">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to App
                        </Link>
                    </Button>
                </div>
                <Header />

                <header className="text-center mb-6 pt-16 sm:pt-0">
                    <div className="flex justify-center items-center gap-2.5">
                        <Image src={logoSrc} alt="seQRets Logo" width={144} height={144} className="self-start -mt-2" priority />
                        <div>
                            <h1 className="font-body text-5xl md:text-7xl font-black text-foreground tracking-tighter">
                                seQRets
                            </h1>
                            <p className="text-right text-base font-bold text-foreground tracking-wide">
                                Secure. Split. Share.
                            </p>
                        </div>
                    </div>
                </header>

                <Card className="flex flex-col flex-grow dark:bg-[#2b2728]">
                    <CardHeader className="p-10">
                        <div className="flex items-center gap-4">
                            <Bot className="h-8 w-8" />
                            <div>
                                <CardTitle className="text-2xl">Ask Bob AI</CardTitle>
                                <CardDescription>Your AI-powered expert on seQRets. Ask me anything about the app.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-grow flex flex-col p-10 pt-0">
                       <BobChatInterface initialMessage="How can I help you with seQRets today?" />
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
