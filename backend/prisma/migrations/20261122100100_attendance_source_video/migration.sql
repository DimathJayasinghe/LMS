-- A recording watched counts as the weakest attendance source (D-ACCESS-5). Its own migration because
-- a new enum value cannot be used in the transaction that adds it; nothing writes it yet.

-- AlterEnum
ALTER TYPE "AttendanceSource" ADD VALUE 'VIDEO';
