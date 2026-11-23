import { config } from 'dotenv';
import * as path from 'node:path';
import { APP_ROOT } from './config/env';

// Load .env before anything reads process.env (existing variables win, like python-dotenv).
config({ path: path.join(APP_ROOT, '.env'), quiet: true });
