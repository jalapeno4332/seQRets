import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, ExternalLink, Key, Check, AlertCircle } from 'lucide-react';
import { setApiKey } from '@/lib/bob-api';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
    <div className="flex flex-col h-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Bot className="h-6 w-6" />
          </div>
          <CardTitle>Set Up Bob AI</CardTitle>
          <CardDescription>
            Bob needs a Google Gemini API key to work. It's free and takes about 2 minutes to set up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
              <p>
                Go to{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline inline-flex items-center gap-1"
                >
                  Google AI Studio <ExternalLink className="h-3 w-3" />
                </a>{' '}
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
