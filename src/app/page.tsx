'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateSharesForm } from "@/app/components/create-shares-form";
import { RestoreSecretForm } from "@/app/components/restore-secret-form";
import { Lock, Combine, Bot } from "lucide-react";
import Image from "next/image";
import React, { useEffect } from "react";
import { Header } from "./components/header";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BobChatInterface } from "./components/bob-chat-interface";
import { BitcoinTicker } from "./components/bitcoin-ticker";
import { WelcomeGuide } from "./components/welcome-guide";


function App() {
  const [activeTab, setActiveTab] = React.useState<'create' | 'restore'>('create');

  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'create' || tab === 'restore') {
      setActiveTab(tab);
    }
  }, [searchParams]);


  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12">
      <WelcomeGuide activeTab={activeTab} />
      <div className="w-full max-w-4xl mx-auto relative">
        <div className="absolute top-4 left-4 z-50">
            <Popover>
              <PopoverTrigger asChild>
                 <Button variant="outline" className="hidden md:inline-flex hover:bg-accent text-foreground" >
                    <Bot className="mr-2 h-5 w-5" />
                    Ask Bob
                </Button>
              </PopoverTrigger>
               <PopoverContent align="start" className="w-96 h-[32rem]">
                  <BobChatInterface
                    initialMessage="Hi! I'm Bob, your AI assistant. How can I help you with seQRets today?"
                    showLinkToFullPage={true}
                  />
               </PopoverContent>
            </Popover>
             <Button asChild size="icon" variant="outline" className="md:hidden inline-flex">
                <Link href="/support">
                    <Bot className="h-5 w-5" />
                    <span className="sr-only">Ask Bob</span>
                </Link>
            </Button>
        </div>
        <Header activeTab={activeTab} onTabChange={setActiveTab}/>
        <header className="text-center mb-6 pt-16 sm:pt-0">
          <div className="flex justify-center items-center gap-4">
            <Image src="/icons/icon-512x512.png" alt="seQRets Logo" width={64} height={64} data-ai-hint="logo" priority />
            <h1 className="font-body text-5xl md:text-7xl font-black text-foreground tracking-tighter">
              seQRets
            </h1>
          </div>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            <span className="font-normal">Crypto inheritance that actually works.</span>
          </p>
        </header>

        <div className="mb-10">
          <BitcoinTicker />
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'create' | 'restore')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="create" className="text-base">
              <Lock className="mr-2 h-5 w-5" />
              Secure Secret
            </TabsTrigger>
            <TabsTrigger value="restore" className="text-base">
              <Combine className="mr-2 h-5 w-5" />
              Restore Secret
            </TabsTrigger>
          </TabsList>
          <TabsContent value="create" className="mt-6">
            <CreateSharesForm />
          </TabsContent>
          <TabsContent value="restore" className="mt-6">
            <RestoreSecretForm />
          </TabsContent>
        </Tabs>

        <footer className="text-center mt-12 text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} seQRets. All rights reserved.</p>
          <p className="mt-1">Version 0.9.0 🔥 Pyre</p>
          <p className="mt-1">Your security is your responsibility. Use with caution.</p>
        </footer>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <App />
    </React.Suspense>
  );
}
