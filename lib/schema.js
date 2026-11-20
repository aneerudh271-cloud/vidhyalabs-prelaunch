'use strict';
/* Table definitions, created automatically on first request. Mirrored in db/schema.sql for reference. */
module.exports = [
  `CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY, at bigint NOT NULL, status text NOT NULL DEFAULT 'Placed',
  name text, phone text NOT NULL, area text, address text, payment text, slot text, when_text text, notes text,
  total numeric NOT NULL DEFAULT 0, unpriced integer NOT NULL DEFAULT 0, items jsonb NOT NULL DEFAULT '[]',
  updated bigint NOT NULL, driver text NOT NULL DEFAULT '', store text NOT NULL DEFAULT ''
)`,
  `CREATE INDEX IF NOT EXISTS orders_phone ON orders(phone)`,
  `CREATE INDEX IF NOT EXISTS orders_at ON orders(at DESC)`,
  `CREATE INDEX IF NOT EXISTS orders_driver ON orders(driver) WHERE driver <> ''`,
  `CREATE INDEX IF NOT EXISTS orders_store ON orders(store) WHERE store <> ''`,
  `CREATE TABLE IF NOT EXISTS messages (id bigserial PRIMARY KEY, at bigint NOT NULL, phone text NOT NULL, name text, sender text NOT NULL, text text NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS messages_phone ON messages(phone, at)`,
  `CREATE TABLE IF NOT EXISTS waitlist (id bigserial PRIMARY KEY, at bigint NOT NULL, name text, phone text NOT NULL, area text, interests text)`,
  `CREATE TABLE IF NOT EXISTS drivers (id text PRIMARY KEY, name text NOT NULL, phone text NOT NULL UNIQUE, pinhash text NOT NULL, active boolean NOT NULL DEFAULT true, created bigint NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS stores (
  id text PRIMARY KEY, at bigint NOT NULL, status text NOT NULL DEFAULT 'Pending', name text NOT NULL, owner text, phone text NOT NULL,
  area text, address text, categories text, fssai text, notes text, pinhash text NOT NULL DEFAULT '', updated bigint NOT NULL
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS stores_active_phone ON stores(phone) WHERE status IN ('Pending','Approved')`,
  `CREATE TABLE IF NOT EXISTS customers (sub text PRIMARY KEY, email text, name text, phone text NOT NULL DEFAULT '', created bigint NOT NULL, last_login bigint NOT NULL)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS rl (k text PRIMARY KEY, n integer NOT NULL, until bigint NOT NULL)`
];
