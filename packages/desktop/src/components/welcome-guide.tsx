import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bot, ArrowDown, Sparkles } from 'lucide-react';

const WELCOME_GUIDE_KEY = 'seQRets_welcomeGuideShown_v1';

interface WelcomeGuideProps {
  activeTab: 'create' | 'restore';
}

export function WelcomeGuide({ activeTab }: WelcomeGuideProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const hasSeenGuide = localStorage.getItem(WELCOME_GUIDE_KEY);
      if (!hasSeenGuide) {
        setIsOpen(true);
      }
    } catch (error) {
      console.warn('Could not read from localStorage:', error);
      // If localStorage is blocked, we'll just show the guide once per session.
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    try {
      localStorage.setItem(WELCOME_GUIDE_KEY, 'true');
    } catch (error) {
      console.warn('Could not write to localStorage:', error);
    }
    setIsOpen(false);
  };

  const createContent = {
    title: "Let's Secure Your First Secret!",
    description: "Just follow the three steps on this page, clicking the 'Next Step' button to advance.",
  };

  const restoreContent = {
    title: "Ready to Restore Your Secret?",
    description: "Just follow the numbered steps on this page to add your backups and provide your credentials, using the 'Next Step' button to move forward.",
  };

  const content = activeTab === 'create' ? createContent : restoreContent;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center text-2xl gap-3">
             <Sparkles className="h-8 w-8 text-primary" />
            {content.title}
          </DialogTitle>
          <DialogDescription className="pt-2 text-center font-bold">
            {content.description}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-muted/50 p-4 mt-2">
            <div className="flex items-start gap-4">
                <Bot className="h-10 w-10 text-muted-foreground mt-1 flex-shrink-0" />
                <div>
                    <h4 className="font-semibold">Meet Bob, Your AI Assistant</h4>
                    <p className="text-sm text-muted-foreground">
                        Have questions about security, inheritance planning, or how to use the app? Just click the "Ask Bob" button at the top of the page.
                    </p>
                </div>
            </div>
        </div>
        <DialogFooter className="mt-4">
          <Button onClick={handleClose} className="w-full text-white bg-gradient-to-r from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600">
            Let's Go!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
