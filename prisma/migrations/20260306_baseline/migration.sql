-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_category" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_transaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_transaction_item" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceAtTime" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "pos_transaction_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "pos_tenant_email_key" ON "pos_tenant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "pos_category_tenantId_name_key" ON "pos_category"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "pos_category" ADD CONSTRAINT "pos_category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "pos_tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_product" ADD CONSTRAINT "pos_product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "pos_tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_product" ADD CONSTRAINT "pos_product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "pos_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_transaction" ADD CONSTRAINT "pos_transaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "pos_tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_transaction_item" ADD CONSTRAINT "pos_transaction_item_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "pos_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_transaction_item" ADD CONSTRAINT "pos_transaction_item_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pos_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
