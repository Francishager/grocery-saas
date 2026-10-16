ALTER TABLE "user_permissions"
  ADD COLUMN "canViewTeamMessaging" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "canSendTeamMessages" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "user_permissions"
SET
  "canViewTeamMessaging" = "canViewCommunication",
  "canSendTeamMessages" = "canCreateCommunication";
