-- AlterTable
ALTER TABLE "regional_offices" ADD COLUMN     "whatsapp_phone" VARCHAR(32);

-- CreateIndex
CREATE UNIQUE INDEX "regional_offices_whatsapp_phone_key" ON "regional_offices"("whatsapp_phone");
