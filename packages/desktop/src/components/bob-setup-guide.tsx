import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, ExternalLink, Key, Check, AlertCircle, MessageCircle, User } from 'lucide-react';
import { setApiKey } from '@/lib/bob-api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { openUrl } from '@tauri-apps/plugin-opener';

interface BobSetupGuideProps {
  onKeyConfigured: () => void;
}

export function BobSetupGuide({ onKeyConfigured }: BobSetupGuideProps) {
  const [apiKey, setApiKeyInput] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError('Please enter an API key.');
      return;
    }
    if (!trimmed.startsWith('AIza')) {
      setError('This doesn\'t look like a valid Gemini API key. Keys typically start with "AIza".');
      return;
    }
    setApiKey(trimmed);
    onKeyConfigured();
  };

  return (
    <div className="flex flex-col h-full items-center justify-center p-0 overflow-hidden">
      <Card className="w-full bg-muted/50">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Bot className="h-6 w-6" />
          </div>
          <CardTitle>Meet Bob — Your AI Guide</CardTitle>
          <CardDescription>
            Bob is an AI assistant built into seQRets that explains encryption concepts, guides you through features, and helps troubleshoot issues.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mini chat preview */}
          <div className="rounded-lg border bg-background p-3 space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-3 w-3 text-muted-foreground" />
              </div>
              <p className="rounded-lg bg-muted px-2.5 py-1.5 text-muted-foreground">"How does Shamir's Secret Sharing work?"</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Bot className="h-3 w-3 text-primary" />
              </div>
              <p className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-foreground">"It splits your secret into multiple shares so that only a chosen number of them are needed to reconstruct it..."</p>
            </div>
          </div>

          {/* Example prompts */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <MessageCircle className="h-3 w-3" /> Try asking Bob:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {['Help me set up an Inheritance Plan', 'What is Argon2id?', 'How do I use a keyfile?'].map((q) => (
                <span key={q} className="inline-block rounded-full border px-2.5 py-1 text-xs text-muted-foreground">{q}</span>
              ))}
            </div>
          </div>

          {/* Setup heading */}
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-center text-muted-foreground mb-3">Connect Bob with a free Google Gemini API key — takes about 2 minutes</p>
          </div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
              <p>
                Go to{' '}
                <button
                  type="button"
                  onClick={() => openUrl('https://aistudio.google.com/api-keys')}
                  className="text-primary underline inline-flex items-center gap-1 cursor-pointer"
                >
                  Google AI Studio <ExternalLink className="h-3 w-3" />
                </button>{' '}
                and sign in with your Google account.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</div>
              <p>Click <strong>"Create API Key"</strong> and copy the generated key.</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</div>
              <p>Paste your API key below and click <strong>"Save & Connect"</strong>.</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Paste your Gemini API key here..."
                value={apiKey}
                onChange={(e) => { setApiKeyInput(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <Button onClick={handleSave} className="shrink-0">
                <Check className="h-4 w-4 mr-1" />
                Save
              </Button>
            </div>
            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex items-start gap-2 p-3 rounded-md bg-muted text-xs text-muted-foreground">
            <Key className="h-4 w-4 shrink-0 mt-0.5" />
            <p>Your API key is stored locally on your device and is never sent anywhere except directly to Google's API. You can remove it anytime.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
