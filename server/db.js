import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function openDatabase(path = process.env.DATABASE_PATH || './data/openmetrika.db') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sites(id TEXT PRIMARY KEY,name TEXT NOT NULL,domains TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES users(id),replay INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS members(site_id TEXT REFERENCES sites(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('viewer','editor')),PRIMARY KEY(site_id,user_id));
    CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,hash TEXT NOT NULL UNIQUE,name TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS visits(id TEXT NOT NULL,site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,visitor TEXT NOT NULL,started INTEGER NOT NULL,ended INTEGER NOT NULL,entry TEXT NOT NULL,exit TEXT NOT NULL,source TEXT NOT NULL,medium TEXT NOT NULL,campaign TEXT NOT NULL,referrer TEXT NOT NULL,device TEXT NOT NULL,browser TEXT NOT NULL,os TEXT NOT NULL,country TEXT NOT NULL DEFAULT '',viewport_w INTEGER NOT NULL DEFAULT 0,viewport_h INTEGER NOT NULL DEFAULT 0,pageviews INTEGER NOT NULL DEFAULT 0,active_seconds INTEGER NOT NULL DEFAULT 0,max_scroll INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(site_id,id));
    CREATE INDEX IF NOT EXISTS visits_period ON visits(site_id,started);
    CREATE INDEX IF NOT EXISTS visits_visitor ON visits(site_id,visitor);
    CREATE TABLE IF NOT EXISTS events(id TEXT NOT NULL,site_id TEXT NOT NULL,visit_id TEXT NOT NULL,ts INTEGER NOT NULL,type TEXT NOT NULL,path TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',props TEXT NOT NULL DEFAULT '{}',PRIMARY KEY(site_id,id),FOREIGN KEY(site_id,visit_id) REFERENCES visits(site_id,id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS events_visit ON events(site_id,visit_id,ts);
    CREATE INDEX IF NOT EXISTS events_time ON events(site_id,ts,type);
    CREATE TABLE IF NOT EXISTS goals(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('event','page')),value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS conversions(goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,site_id TEXT NOT NULL,visit_id TEXT NOT NULL,event_id TEXT NOT NULL,ts INTEGER NOT NULL,PRIMARY KEY(goal_id,event_id),FOREIGN KEY(site_id,visit_id) REFERENCES visits(site_id,id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS replay_chunks(site_id TEXT NOT NULL,visit_id TEXT NOT NULL,chunk_id TEXT NOT NULL,ts INTEGER NOT NULL,payload BLOB NOT NULL,PRIMARY KEY(site_id,visit_id,chunk_id),FOREIGN KEY(site_id,visit_id) REFERENCES visits(site_id,id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS funnels(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,name TEXT NOT NULL,steps TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS saved_reports(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,config TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders(site_id TEXT NOT NULL,order_id TEXT NOT NULL,visit_id TEXT NOT NULL,ts INTEGER NOT NULL,revenue REAL NOT NULL,currency TEXT NOT NULL,items TEXT NOT NULL,PRIMARY KEY(site_id,order_id),FOREIGN KEY(site_id,visit_id) REFERENCES visits(site_id,id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS ad_costs(site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,day TEXT NOT NULL,source TEXT NOT NULL,campaign TEXT NOT NULL,currency TEXT NOT NULL,amount REAL NOT NULL,PRIMARY KEY(site_id,day,source,campaign,currency));
  `)
  return db
}
