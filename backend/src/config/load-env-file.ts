import dotenv from 'dotenv';

// env.ts imports this first, so backend/.env is applied before any later import reads
// process.env while it loads (for example the cookie options in utils/constants).
dotenv.config();
