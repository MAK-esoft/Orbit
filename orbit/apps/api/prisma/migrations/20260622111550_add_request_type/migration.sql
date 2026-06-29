-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('DEPOSIT', 'EXPENSE', 'SALARY_DISBURSEMENT', 'VENDOR_PAYMENT', 'OTHER');

-- AlterTable
ALTER TABLE "payment_submissions" ADD COLUMN     "request_type" "RequestType" NOT NULL DEFAULT 'OTHER';
