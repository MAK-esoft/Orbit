-- CreateEnum
CREATE TYPE "SubmissionSource" AS ENUM ('APP', 'WHATSAPP', 'SLACK');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('NONE', 'PENDING', 'ENRICHED', 'FAILED');

-- AlterTable
ALTER TABLE "payment_submissions" ADD COLUMN     "enrichment_status" "EnrichmentStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "sender_ref" VARCHAR(255),
ADD COLUMN     "source" "SubmissionSource" NOT NULL DEFAULT 'APP',
ALTER COLUMN "amount" DROP NOT NULL,
ALTER COLUMN "attachment_path" DROP NOT NULL;

-- AlterTable
ALTER TABLE "regional_offices" ADD COLUMN     "slack_channel_id" VARCHAR(255),
ADD COLUMN     "whatsapp_group_id" VARCHAR(255);

-- CreateTable
CREATE TABLE "submission_extractions" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "classification" VARCHAR(50) NOT NULL,
    "extracted_amount" DECIMAL(12,2),
    "extracted_payment_method" VARCHAR(50),
    "slip_ref" VARCHAR(255),
    "merchant" VARCHAR(255),
    "description" TEXT,
    "bank_email_match" BOOLEAN NOT NULL DEFAULT false,
    "bank_email_amount" DECIMAL(12,2),
    "bank_email_timestamp" TIMESTAMP(3),
    "confidence" VARCHAR(50),
    "model" VARCHAR(100),
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submission_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_messages" (
    "id" UUID NOT NULL,
    "source" "SubmissionSource" NOT NULL,
    "sender_ref" VARCHAR(255),
    "channel_id" VARCHAR(255),
    "message_text" TEXT,
    "media_url" TEXT,
    "media_mime" VARCHAR(100),
    "raw_payload" JSONB NOT NULL,
    "classification" VARCHAR(50),
    "processing_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "submission_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "submission_extractions_submission_id_key" ON "submission_extractions"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_messages_submission_id_key" ON "workflow_messages"("submission_id");

-- CreateIndex
CREATE INDEX "workflow_messages_processing_status_idx" ON "workflow_messages"("processing_status");

-- CreateIndex
CREATE INDEX "payment_submissions_source_idx" ON "payment_submissions"("source");

-- CreateIndex
CREATE UNIQUE INDEX "regional_offices_whatsapp_group_id_key" ON "regional_offices"("whatsapp_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "regional_offices_slack_channel_id_key" ON "regional_offices"("slack_channel_id");

-- AddForeignKey
ALTER TABLE "submission_extractions" ADD CONSTRAINT "submission_extractions_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "payment_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_messages" ADD CONSTRAINT "workflow_messages_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "payment_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

