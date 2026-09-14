import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { it, expect } from "vitest";

it("migrates a fresh and an existing database repeatedly without losing data", async () => {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key, name text, public boolean);");
  // gen_random_uuid is built into PostgreSQL; the optional pgcrypto extension
  // is not bundled in PGlite. All application SQL executes unchanged below.
  const schema = readFileSync("supabase/schema.sql", "utf8").replace("create extension if not exists pgcrypto;", "");
  await db.exec(schema);
  await db.exec("insert into toy_projects(id,prototype_task_id,preview_url,size_cm,price_eur) values ('11111111-1111-4111-8111-111111111111','prototype','preview',10,49);");
  await db.exec("alter table toy_projects alter column preview_url set not null;");
  const files = readdirSync("supabase").filter((f) => /^\d.*\.sql$/.test(f)).sort();
  for (let run = 0; run < 2; run++) {
    for (const name of files) await db.exec(readFileSync(`supabase/${name}`, "utf8"));
    await db.exec(schema);
  }
  await db.exec("update toy_projects set preview_url=null;");
  const rights = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>("select has_function_privilege('anon','consume_api_rate_limit(text,text,integer,integer)','EXECUTE') as anon, has_function_privilege('authenticated','consume_api_rate_limit(text,text,integer,integer)','EXECUTE') as authenticated, has_function_privilege('service_role','consume_api_rate_limit(text,text,integer,integer)','EXECUTE') as service");
  expect(rights.rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  const allowed = await db.query<{ allowed: boolean }>("select * from consume_api_rate_limit('test','key',60,1)");
  const denied = await db.query<{ allowed: boolean }>("select * from consume_api_rate_limit('test','key',60,1)");
  expect(allowed.rows[0].allowed).toBe(true);
  expect(denied.rows[0].allowed).toBe(false);
  expect((await db.query("select * from toy_projects")).rows).toHaveLength(1);
  await db.close();
});
