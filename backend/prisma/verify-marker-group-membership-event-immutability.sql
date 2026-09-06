-- CI-only proof for the MarkerGroupMembershipEvent immutability trigger.
-- Expected result: this script exits 0 only when both direct mutations fail
-- with exactly "MarkerGroupMembershipEvent rows are immutable". All fixtures
-- are contained in the transaction and discarded by ROLLBACK.
BEGIN;

INSERT INTO "User" ("id", "indexNumber", "email", "name", "password", "role", "updatedAt") VALUES
  ('ci-marker-group-actor', 900001, 'ci-marker-group-actor@example.invalid', 'CI Actor', 'not-a-real-password', 'SUPER_ADMIN', CURRENT_TIMESTAMP),
  ('ci-marker-group-marker', 900002, 'ci-marker-group-marker@example.invalid', 'CI Marker', 'not-a-real-password', 'MARKER', CURRENT_TIMESTAMP);

INSERT INTO "Institute" ("id", "name", "code", "updatedAt") VALUES
  ('ci-marker-group-institute', 'CI Marker Group Institute', 'CIMGI', CURRENT_TIMESTAMP);

INSERT INTO "MarkerGroup" (
  "id", "name", "scope", "instituteId", "createdById", "updatedAt"
) VALUES (
  'ci-marker-group', 'CI immutable-event group', 'INSTITUTE',
  'ci-marker-group-institute', 'ci-marker-group-actor', CURRENT_TIMESTAMP
);

INSERT INTO "MarkerGroupMembershipEvent" (
  "id", "action", "reason", "groupId", "markerId", "actorId"
) VALUES (
  'ci-marker-group-event', 'ADDED', 'CI trigger verification',
  'ci-marker-group', 'ci-marker-group-marker', 'ci-marker-group-actor'
);

DO $$
BEGIN
  BEGIN
    UPDATE "MarkerGroupMembershipEvent"
    SET "reason" = 'direct update must fail'
    WHERE "id" = 'ci-marker-group-event';
    RAISE EXCEPTION 'MarkerGroupMembershipEvent UPDATE unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MarkerGroupMembershipEvent rows are immutable' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    DELETE FROM "MarkerGroupMembershipEvent"
    WHERE "id" = 'ci-marker-group-event';
    RAISE EXCEPTION 'MarkerGroupMembershipEvent DELETE unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MarkerGroupMembershipEvent rows are immutable' THEN
      RAISE;
    END IF;
  END;
END;
$$;

ROLLBACK;
