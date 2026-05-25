import { Router } from 'express';
import * as StreamController from '@/controllers/stream.controller';
import { verifyToken } from '@/middleware/auth.middleware';

export const streamRoutes = Router();

// GET /api/stream — authenticated SSE connection
streamRoutes.get('/', verifyToken, StreamController.connect);
