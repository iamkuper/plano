-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'INVOICE');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "invoiceNumber" INTEGER,
ADD COLUMN     "method" "PaymentMethod" NOT NULL DEFAULT 'CARD',
ADD COLUMN     "payerAddress" TEXT,
ADD COLUMN     "payerEmail" TEXT,
ADD COLUMN     "payerInn" TEXT,
ADD COLUMN     "payerKpp" TEXT,
ADD COLUMN     "payerName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_invoiceNumber_key" ON "Payment"("invoiceNumber");

