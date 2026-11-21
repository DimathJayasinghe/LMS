# Organization settings

All routes require authentication and `SUPER_ADMIN`. Organization is resolved from the authenticated user. `GET /api/settings` returns `{ status: "success", data: [{ key, value, default }], count }`. Missing rows use registry defaults.

`PATCH /api/settings/:key` accepts `{ "value": ... }` and returns `{ status: "success", data: { key, value } }`. Unknown keys and values outside their registered type or range return 400; other roles receive 403. A changed value and `SETTING_CHANGED` audit row are committed together. Changes affect future decisions. `exams.marking.markerMayOverrideTeacher` remains fixed at false.

`fees.graceDays` defaults to 10 (0–31); `fees.graceRequiresPreviousMonthPaid` defaults to true. A student with an active enrollment is covered by a successful payment for the organization billing month, or during grace by the previous month's successful payment. If the previous-payment requirement is switched off, grace applies to any active enrollment. Setting grace to 0 restores the strict monthly gate. Other registry defaults and ranges are defined in `backend/src/config/settings-registry.ts`.
