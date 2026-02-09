'use server';
import { config } from 'dotenv';
config();

import './genkit';
import './flows/ask-bob-flow';
import './flows/deadman-flow';
