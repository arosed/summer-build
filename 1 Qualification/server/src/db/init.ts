import { sqlite } from './index.js';

export function createTables(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      account_id TEXT PRIMARY KEY,
      account_name TEXT NOT NULL,
      arr REAL NOT NULL,
      mrr REAL NOT NULL,
      seat_count INTEGER NOT NULL,
      seats_active INTEGER NOT NULL,
      logins_90d INTEGER NOT NULL,
      support_ticket_count INTEGER NOT NULL,
      num_previous_contracts INTEGER NOT NULL,
      contract_end_date TEXT NOT NULL,
      contract_length_days INTEGER NOT NULL,
      contract_start_date TEXT NOT NULL,
      tier TEXT NOT NULL,
      product TEXT NOT NULL,
      feature_adoption_score REAL NOT NULL,
      churned INTEGER NOT NULL,
      tone INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS historical_arr (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      quarter TEXT NOT NULL,
      arr REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qualification_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS qualification_results (
      account_id TEXT PRIMARY KEY,
      signal TEXT NOT NULL,
      status_color TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      reasons TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_new INTEGER NOT NULL DEFAULT 0
    );
  `);
}
