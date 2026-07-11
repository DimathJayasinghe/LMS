import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as NotificationSettingService from '@/services/notification-setting.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import { notificationSettingIdParamSchema } from '@/schemas/notification.schema';
import type { UpdateNotificationSettingInput } from '@/schemas/notification.schema';

export const listSettings = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const settings = await NotificationSettingService.listSettings();

	res.status(200).json({
		status: 'success',
		data: settings,
		count: settings.length,
	});
});

export const updateSetting = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = notificationSettingIdParamSchema.parse(req.params);
	const input = req.body as UpdateNotificationSettingInput;

	const setting = await NotificationSettingService.updateSetting(id, input);

	void AuditService.log({
		action: AUDIT_ACTION.NOTIFICATION_SETTING_UPDATED,
		description: `${setting.type} / ${setting.channel} notifications ${input.enabled ? 'enabled' : 'disabled'}`,
		targetType: 'NotificationSetting',
		targetId: id,
		metadata: { type: setting.type, channel: setting.channel, enabled: input.enabled },
		context: extractAuditContext(req),
	});

	res.status(200).json({
		status: 'success',
		data: setting,
		message: 'Notification setting updated successfully.',
	});
});
