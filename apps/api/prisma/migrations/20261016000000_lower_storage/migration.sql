-- File storage per paid seat: Pro 10 GB, Business 50 GB.
UPDATE "Plan" SET "storageMbPerSeat" = 10240 WHERE "id" = 'PRO';
UPDATE "Plan" SET "storageMbPerSeat" = 51200 WHERE "id" = 'BUSINESS';
