-- Postgres row-level security by company: a second net under the application's scoping (NOT applied yet).
--
-- Status: prepared, not in the drizzle migration chain. The services still use the pooled `db` handle directly
-- (many reads run outside a per-request transaction), so a per-request `set_config('app.entity_ids', …, true)`
-- would not reach every statement. Before applying:
--   1. run each request in one transaction (or a request-scoped connection) and, at its start:
--        SELECT set_config('app.entity_ids', '<comma-separated scope>', true);  -- the Principal's scope
--      system jobs (seed, SMS webhook, geofence) set 'app.bypass' = 'on' explicitly instead;
--   2. connect the API as `btw_app` (below), which has no BYPASSRLS and does not own the tables;
--   3. run this file once as the table owner, then the QA tenancy matrix (pnpm --filter @btw/server test:qa --only tenancy).
-- The application checks (Principal.scope, assertEntity, writeEntity) stay: RLS only catches what they miss.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'btw_app') THEN CREATE ROLE btw_app LOGIN NOBYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO btw_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO btw_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO btw_app;

-- true when the row's company is in the request's scope (or a system job bypasses)
CREATE OR REPLACE FUNCTION app_entity_ok(e text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.bypass', true) = 'on'
      OR e = ANY (string_to_array(coalesce(current_setting('app.entity_ids', true), ''), ','))
$$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['plans', 'pos', 'waiting_entries', 'loadings', 'shipments', 'acks', 'stock_moves', 'sales', 'trip_costs', 'trip_payments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS entity_scope ON %I', tbl);
    EXECUTE format('CREATE POLICY entity_scope ON %I USING (app_entity_ok(entity_id)) WITH CHECK (app_entity_ok(entity_id))', tbl);
  END LOOP;
END $$;

-- An intercompany sale also writes the buyer's "transfer in" stock move: the buyer must be in scope too, or the
-- service must set app.bypass for that one insert. Notifications: entity_id may be null (not company-specific).
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entity_scope ON notifications;
CREATE POLICY entity_scope ON notifications USING (entity_id IS NULL OR app_entity_ok(entity_id)) WITH CHECK (entity_id IS NULL OR app_entity_ok(entity_id));
-- legs and positions have no entity_id: they are reached through shipments (scoped above) and stay unrestricted here.
