'use strict';
/* Database access. Production: Neon Postgres (Vercel Storage). Tests inject their own query function. */
let query = null;
const DDL = require('./schema');

function url() { return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || ''; }
function configured() { return !!query || !!url(); }

function getQuery() {
  if (query) return query;
  const u = url();
  if (!u) { const e = new Error('no database configured'); e.code = 'NODB'; throw e; }
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(u);
  query = (text, params) => sql.query(text, params || []);
  return query;
}
function setQuery(fn) { query = fn; ready = null; }

let ready = null;
function init() {
  if (!ready) {
    const q = getQuery();
    ready = (async () => { for (const s of DDL) await q(s); })().catch(e => { ready = null; throw e; });
  }
  return ready;
}
async function run(text, params) { await init(); return getQuery()(text, params || []); }

module.exports = { run, configured, setQuery, init };
