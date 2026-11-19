-- AddEnumValue
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- CreateEnum (idempotent because the legacy entrypoint may have run db push first)
DO $$ BEGIN
  CREATE TYPE "PaymentAdjustmentType" AS ENUM ('OVERRIDE', 'REFUND');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Payment"
ADD COLUMN IF NOT EXISTS "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PaymentAdjustment" (
    "id" TEXT NOT NULL,
    "type" "PaymentAdjustmentType" NOT NULL,
    "amount" DECIMAL(10,2),
    "statusBefore" "PaymentStatus" NOT NULL,
    "statusAfter" "PaymentStatus" NOT NULL,
    "paymentAmountBefore" DECIMAL(10,2) NOT NULL,
    "paymentAmountAfter" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "externalReference" TEXT,
    "paymentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PaymentAdjustment_paymentId_createdAt_idx" ON "PaymentAdjustment"("paymentId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentAdjustment_createdById_idx" ON "PaymentAdjustment"("createdById");
CREATE INDEX IF NOT EXISTS "PaymentAdjustment_type_idx" ON "PaymentAdjustment"("type");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Ledger rows are append-only even if a future code path accidentally attempts a mutation.
CREATE OR REPLACE FUNCTION reject_payment_adjustment_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PaymentAdjustment rows are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "PaymentAdjustment_immutable" ON "PaymentAdjustment";
CREATE TRIGGER "PaymentAdjustment_immutable"
BEFORE UPDATE OR DELETE ON "PaymentAdjustment"
FOR EACH ROW EXECUTE FUNCTION reject_payment_adjustment_mutation();
