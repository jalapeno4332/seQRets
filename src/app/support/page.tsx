

'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Bot } from "lucide-react";
import Link from "next/link";
import { Header } from "../components/header";
import { BobChatInterface } from '../components/bob-chat-interface';


export default function SupportPage() {
    return (
        <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12">
            <div className="w-full max-w-4xl mx-auto relative flex flex-col h-[calc(100vh-6rem)]">
                <Header />
                 <div className="mb-8 pt-16 sm:pt-0">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to App
                        </Link>
                    </Button>
                </div>
                <Card className="flex flex-col flex-grow">
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
