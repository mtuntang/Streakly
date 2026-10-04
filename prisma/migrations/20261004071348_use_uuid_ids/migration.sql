/*
  Warnings:

  - The primary key for the `check_ins` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `check_ins` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `goals` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `goals` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `goalId` on the `check_ins` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- Data in goals/check_ins is disposable at this stage and the old ids
-- (cuid text) are not castable to uuid; rows are truncated. gen_random_uuid()
-- needs the pgcrypto extension.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
TRUNCATE TABLE "check_ins", "goals" CASCADE;

-- DropForeignKey
ALTER TABLE "check_ins" DROP CONSTRAINT "check_ins_goalId_fkey";

-- AlterTable
ALTER TABLE "check_ins" DROP CONSTRAINT "check_ins_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
DROP COLUMN "goalId",
ADD COLUMN     "goalId" UUID NOT NULL,
ADD CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "goals" DROP CONSTRAINT "goals_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "goals_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "check_ins_goalId_date_key" ON "check_ins"("goalId", "date");

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
