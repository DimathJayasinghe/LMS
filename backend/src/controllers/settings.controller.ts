import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as SettingsService from '@/services/settings.service';
import { updateSettingSchema } from '@/schemas/settings.schema';

export const listSettings = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const settings = await SettingsService.listSettings(req.user!);
  res.status(200).json({ status: 'success', data: settings, count: settings.length });
});
export const updateSetting = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { value } = updateSettingSchema.parse(req.body);
  const result = await SettingsService.updateSetting(req.user!, String(req.params.key), value);
  res.status(200).json({ status: 'success', data: result });
});
