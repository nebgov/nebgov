import { execSync } from "child_process";
import path from "path";
import { Pool, Client } from "pg";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { BACKEND_MIGRATIONS_TABLE } from "../../db/migrationRunner";

describe("Database Migrations Integration", () => {
  let container: any;
  let databaseUrl: string;
  let pool: Pool;
  let tempDbName: string | null = null;
  let defaultDbUrl: string | null = null;
  let hasDatabase = true;

  beforeAll(async () => {
    // Large timeout for container startup
    jest.setTimeout(120000);

    try {
      if (process.env.DATABASE_URL) {
        defaultDbUrl = process.env.DATABASE_URL;
        tempDbName = `temp_mig_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        
        // Connect to default db to create the temp database
        const client = new Client({ connectionString: defaultDbUrl });
        await client.connect();
        await client.query(`CREATE DATABASE ${tempDbName}`);
        await client.end();

        // Parse and build connection URL for the temp database
        const parsedUrl = new URL(defaultDbUrl);
        parsedUrl.pathname = `/${tempDbName}`;
        databaseUrl = parsedUrl.toString();
      } else {
        container = await new PostgreSqlContainer("postgres:15-alpine").start();
        databaseUrl = container.getConnectionString();
      }

      pool = new Pool({ connectionString: databaseUrl });
    } catch (err) {
      console.warn(
        "WARNING: Skipping Database Migrations Integration tests: No working database or container runtime found.",
        err
      );
      hasDatabase = false;
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
    if (container) {
      await container.stop();
    }
    if (tempDbName && defaultDbUrl) {
      try {
        const client = new Client({ connectionString: defaultDbUrl });
        await client.connect();
        // Terminate any active connections to the temp database before dropping it
        await client.query(`
          SELECT pg_terminate_backend(pg_stat_activity.pid)
          FROM pg_stat_activity
          WHERE pg_stat_activity.datname = $1
            AND pid <> pg_backend_pid()
        `, [tempDbName]);
        await client.query(`DROP DATABASE IF EXISTS ${tempDbName}`);
        await client.end();
      } catch (err) {
        console.error(`Failed to clean up temp database ${tempDbName}:`, err);
      }
    }
  });

  it("should run all migrations successfully (Up) and verify idempotency", async () => {
    if (!hasDatabase) return;

    const migrateScript = path.join(__dirname, "../../../src/db/migrate.ts");

    // Run Up migration
    execSync(`npx tsx ${migrateScript}`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });

    // Run Up migration again to verify idempotency (should run successfully and not throw)
    expect(() => {
      execSync(`npx tsx ${migrateScript}`, {
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });
    }).not.toThrow();

    // Verify tables exist
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tables = res.rows.map((r: any) => r.table_name);
    expect(tables).toContain("users");
    expect(tables).toContain("competitions");
    expect(tables).toContain("competition_participants");
    expect(tables).toContain("leaderboard");
    expect(tables).toContain("leaderboard_history");
    expect(tables).toContain("notification_preferences");
    expect(tables).toContain("notification_history");
    expect(tables).toContain("refresh_tokens");
  });

  it("should enforce schema constraints correctly", async () => {
    if (!hasDatabase) return;

    // 1. Insert a test user
    const userRes = await pool.query(
      "INSERT INTO users (wallet_address) VALUES ($1) RETURNING id",
      ["GB2C56789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEF"]
    );
    const userId = userRes.rows[0].id;

    // 2. Insert another test user
    const userRes2 = await pool.query(
      "INSERT INTO users (wallet_address) VALUES ($1) RETURNING id",
      ["GB2C56789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEG"]
    );
    const userId2 = userRes2.rows[0].id;

    // 3. Insert a competition
    const compRes = await pool.query(
      `INSERT INTO competitions (name, start_date, end_date, created_by) 
       VALUES ($1, NOW(), NOW() + INTERVAL '1 day', $2) RETURNING id`,
      ["Test Competition", userId]
    );
    const compId = compRes.rows[0].id;

    // 4. Try to insert two identical participants under the same (competition_id, user_id)
    await pool.query(
      "INSERT INTO competition_participants (competition_id, user_id) VALUES ($1, $2)",
      [compId, userId2]
    );

    // Second insert should fail due to unique constraint
    await expect(
      pool.query(
        "INSERT INTO competition_participants (competition_id, user_id) VALUES ($1, $2)",
        [compId, userId2]
      )
    ).rejects.toThrow();
  });

  it("should rollback (Down) successfully and clean up constraints/tables", async () => {
    if (!hasDatabase) return;

    const migrateScript = path.join(__dirname, "../../../src/db/migrate.ts");

    // Clean up test data that references tables to avoid foreign key violations
    await pool.query("TRUNCATE users CASCADE");

    // Run Down migration to completely revert
    execSync(`npx tsx ${migrateScript} down 4`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });

    // Verify tables are deleted
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tables = res.rows.map((r: any) => r.table_name);
    expect(tables).not.toContain("users");
    expect(tables).not.toContain("competitions");
    expect(tables).not.toContain("competition_participants");
    expect(tables).not.toContain("refresh_tokens");
  });
});
