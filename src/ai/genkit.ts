
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

let ai: ReturnType<typeof genkit> | null = null;

if (apiKey) {
  ai = genkit({
    plugins: [
      googleAI({ apiKey }),
    ],
  });
}

export { ai };
