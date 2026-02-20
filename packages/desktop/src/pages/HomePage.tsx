import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateSharesForm } from "@/components/create-shares-form";
import { RestoreSecretForm } from "@/components/restore-secret-form";
import { Lock, Combine, Bot } from "lucide-react";
import React, { useEffect } from "react";
import { Header } from "@/components/header";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BobChatInterface } from "@/components/bob-chat-interface";
import { BitcoinTicker } from "@/components/bitcoin-ticker";
import { ConnectionStatus } from "@/components/connection-status";
import { WelcomeGuide } from "@/components/welcome-guide";
import { useTheme } from "@/components/theme-provider";
import logoLight from "@/assets/icons/logo-light.png";
import logoDark from "@/assets/icons/logo-dark.png";

export default function HomePage() {
  const [activeTab, setActiveTab] = React.useState<'create' | 'restore'>('create');
  const [searchParams] = useSearchParams();
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const appIcon = isDark ? logoDark : logoLight;

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
               <PopoverContent align="start" className="w-96 h-[32rem] dark:bg-[#2b2728]">
                  <BobChatInterface
                    initialMessage="Hi! I'm Bob, your AI assistant. How can I help you with seQRets today?"
                    showLinkToFullPage={true}
                  />
               </PopoverContent>
            </Popover>
             <Button asChild size="icon" variant="outline" className="md:hidden inline-flex">
                <Link to="/support">
                    <Bot className="h-5 w-5" />
                    <span className="sr-only">Ask Bob</span>
                </Link>
            </Button>
        </div>
        <Header activeTab={activeTab} onTabChange={setActiveTab}/>
        <header className="text-center mb-6 pt-16 sm:pt-0">
          <div className="flex justify-center items-center gap-2.5">
            <img src={appIcon} alt="seQRets Logo" width={144} height={144} className="self-start -mt-2" />
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
          <p className="mt-1">Version 0.9.9 🔐 Sanctum (Desktop) — <em>Beta</em></p>
          <p className="mt-1">All data is processed locally. Your security is your responsibility.</p>
          <p className="mt-1"><ConnectionStatus /></p>
        </footer>
      </div>
    </main>
  );
}
