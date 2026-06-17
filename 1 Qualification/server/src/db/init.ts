import { sqlite } from './index.js';

export function createTables(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS raw_accounts (
      org_id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      monthly_revenue REAL,
      contract_period TEXT,
      active_users_last_quarter INTEGER,
      licensed_seats INTEGER,
      total_logins_90_days INTEGER,
      ticket_volume_ytd INTEGER,
      num_prior_contracts INTEGER,
      subscription_tier TEXT,
      product_package TEXT,
      feature_score REAL,
      did_churn INTEGER
    );

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
      churned INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS normalization_mappings (
      canonical_field TEXT PRIMARY KEY,
      raw_column TEXT,
      confidence REAL,
      transform_fn_code TEXT,
      transform_description TEXT
    );

    CREATE TABLE IF NOT EXISTS historical_arr (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      quarter TEXT NOT NULL,
      arr REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS churn_predictions (
      account_id TEXT PRIMARY KEY,
      churn_probability REAL NOT NULL,
      churned_predicted INTEGER NOT NULL,
      feature1_name TEXT,
      feature1_shap REAL,
      feature1_direction TEXT,
      feature2_name TEXT,
      feature2_shap REAL,
      feature2_direction TEXT
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

    CREATE TABLE IF NOT EXISTS product_features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product TEXT NOT NULL,
      feature_name TEXT NOT NULL,
      release_date TEXT NOT NULL,
      description TEXT
    );
  `);
}
