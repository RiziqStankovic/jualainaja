ALTER TABLE "app_user"
ADD COLUMN "printTemplate" TEXT;

ALTER TABLE "app_user"
ADD COLUMN "printPaperWidth" TEXT NOT NULL DEFAULT '58mm';
