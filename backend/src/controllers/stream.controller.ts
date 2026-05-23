import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as StreamService from '@/services/stream.service';

/**
 * Opens a long-lived SSE connection for the authenticated user.
 * The response stays open until the client disconnects or the server shuts down.
 */
export const connect = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;

  StreamService.registerConnection(user.userId, user.role, res);
});
