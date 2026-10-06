/*
  Warnings:

  - Added the required column `userId` to the `goals` table without a default value. This is not possible if the table is not empty.

*/
-- Existing goals are unowned demo data; delete, then re-seed owned by
-- the demo user (seed.ts creates it via the real sign-up flow).
DELETE FROM "goals";

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "goals_userId_idx" ON "goals"("userId");


-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
