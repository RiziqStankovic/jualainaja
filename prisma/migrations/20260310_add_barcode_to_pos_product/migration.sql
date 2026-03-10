-- AlterTable
ALTER TABLE "pos_product"
ADD COLUMN "barcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pos_product_tenantId_barcode_key" ON "pos_product"("tenantId", "barcode");
