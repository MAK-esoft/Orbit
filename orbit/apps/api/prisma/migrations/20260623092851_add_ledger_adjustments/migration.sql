-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "ledger_adjustments" (
    "id" UUID NOT NULL,
    "ro_id" UUID NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_adjustments_ro_id_idx" ON "ledger_adjustments"("ro_id");

-- AddForeignKey
ALTER TABLE "ledger_adjustments" ADD CONSTRAINT "ledger_adjustments_ro_id_fkey" FOREIGN KEY ("ro_id") REFERENCES "regional_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_adjustments" ADD CONSTRAINT "ledger_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
