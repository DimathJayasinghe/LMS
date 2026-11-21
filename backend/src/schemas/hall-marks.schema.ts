import { z } from 'zod';

/** The registry maximum (`exams.hallMarks.maxRowsPerBatch`); the owner's own limit is enforced in the service. */
const HALL_MARKS_MAX_ROWS = 10000;

export const hallMarksSchema = z.object({
	rows: z
		.array(
			z.object({
				indexNumber: z.number().int().positive().max(2147483647),
				marks: z.number().finite(),
			}),
		)
		.min(1)
		.max(HALL_MARKS_MAX_ROWS),
	// Required on purpose: a client that forgets the flag must fail, not write.
	dryRun: z.boolean(),
});

export type HallMarksInput = z.infer<typeof hallMarksSchema>;
