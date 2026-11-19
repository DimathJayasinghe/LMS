import { Role } from '@prisma/client';
import type { ZoomPastParticipant } from '@/utils/zoom-attendance';

export interface ReconciliationUser {
  id: string;
  name: string;
  email: string;
  indexNumber: number;
  role: Role;
  isEnrolled: boolean;
}

export interface ReconciledParticipant {
  userId: string;
  name: string;
  email: string;
  indexNumber: number;
  firstJoinAt: Date;
  lastLeaveAt: Date;
  durationSeconds: number;
  occurrences: number;
  status: 'MISSING' | 'RECORDED';
}

export interface UnmatchedParticipant {
  name: string;
  email: string | null;
  reason: 'NO_MATCH' | 'AMBIGUOUS' | 'NOT_ENROLLED';
  occurrences: number;
}

const INDEX_SUFFIX = /\(#(\d+)\)\s*$/;

export const collectParticipantIdentifiers = (
  participants: ZoomPastParticipant[],
): { emails: string[]; indexNumbers: number[] } => ({
  emails: [...new Set(participants.flatMap((row) => (row.userEmail ? [row.userEmail] : [])))],
  indexNumbers: [
    ...new Set(
      participants.flatMap((row) => {
        const match = INDEX_SUFFIX.exec(row.name);
        return match ? [Number(match[1])] : [];
      }),
    ),
  ],
});

export const buildReconciliationPreview = (
  rows: ZoomPastParticipant[],
  users: ReconciliationUser[],
  recordedUserIds: Set<string>,
): { participants: ReconciledParticipant[]; unmatched: UnmatchedParticipant[]; ignored: number } => {
  const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const byIndex = new Map(users.map((user) => [user.indexNumber, user]));
  const matched = new Map<string, ReconciledParticipant>();
  const unmatched = new Map<string, UnmatchedParticipant>();
  let ignored = 0;

  for (const row of rows) {
    const candidates = new Map<string, ReconciliationUser>();
    const indexMatch = INDEX_SUFFIX.exec(row.name);
    const emailUser = row.userEmail ? byEmail.get(row.userEmail.toLowerCase()) : undefined;
    const indexUser = indexMatch ? byIndex.get(Number(indexMatch[1])) : undefined;
    if (emailUser) candidates.set(emailUser.id, emailUser);
    if (indexUser) candidates.set(indexUser.id, indexUser);

    if (candidates.size === 1) {
      const user = [...candidates.values()][0]!;
      if (user.role !== Role.STUDENT) {
        ignored += 1;
        continue;
      }

      if (!user.isEnrolled) {
        const key = `${row.name}\u0000${row.userEmail ?? ''}\u0000NOT_ENROLLED`;
        const existing = unmatched.get(key);
        if (existing) existing.occurrences += 1;
        else unmatched.set(key, {
          name: row.name,
          email: row.userEmail,
          reason: 'NOT_ENROLLED',
          occurrences: 1,
        });
        continue;
      }

      const observedUntil = row.leaveTime ?? row.joinTime;
      const existing = matched.get(user.id);
      if (existing) {
        existing.firstJoinAt = existing.firstJoinAt < row.joinTime ? existing.firstJoinAt : row.joinTime;
        existing.lastLeaveAt = existing.lastLeaveAt > observedUntil ? existing.lastLeaveAt : observedUntil;
        existing.durationSeconds += row.durationSeconds;
        existing.occurrences += 1;
      } else {
        matched.set(user.id, {
          userId: user.id,
          name: user.name,
          email: user.email,
          indexNumber: user.indexNumber,
          firstJoinAt: row.joinTime,
          lastLeaveAt: observedUntil,
          durationSeconds: row.durationSeconds,
          occurrences: 1,
          status: recordedUserIds.has(user.id) ? 'RECORDED' : 'MISSING',
        });
      }
      continue;
    }

    const reason = candidates.size > 1 ? 'AMBIGUOUS' : 'NO_MATCH';
    const key = `${row.name}\u0000${row.userEmail ?? ''}\u0000${reason}`;
    const existing = unmatched.get(key);
    if (existing) existing.occurrences += 1;
    else unmatched.set(key, { name: row.name, email: row.userEmail, reason, occurrences: 1 });
  }

  return {
    participants: [...matched.values()].sort((a, b) => a.indexNumber - b.indexNumber),
    unmatched: [...unmatched.values()],
    ignored,
  };
};
