-- No query looks up check-ins by date alone: every lookup is by goal and
-- date, which the unique index on ("goalId", "date") already serves.
DROP INDEX "check_ins_date_idx";
