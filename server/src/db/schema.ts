import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

export const rawAccounts = sqliteTable('raw_accounts', {
  org_id: text('org_id').primaryKey(),
  company_name: text('company_name').notNull(),
  monthly_revenue: real('monthly_revenue'),
  contract_period: text('contract_period'),
  active_users_last_quarter: integer('active_users_last_quarter'),
  licensed_seats: integer('licensed_seats'),
  total_logins_90_days: integer('total_logins_90_days'),
  ticket_volume_ytd: integer('ticket_volume_ytd'),
  num_prior_contracts: integer('num_prior_contracts'),
  subscription_tier: text('subscription_tier'),
  product_package: text('product_package'),
  feature_score: real('feature_score'),
  did_churn: integer('did_churn'),
});

export const accounts = sqliteTable('accounts', {
  account_id: text('account_id').primaryKey(),
  account_name: text('account_name').notNull(),
  arr: real('arr').notNull(),
  mrr: real('mrr').notNull(),
  seat_count: integer('seat_count').notNull(),
  seats_active: integer('seats_active').notNull(),
  logins_90d: integer('logins_90d').notNull(),
  support_ticket_count: integer('support_ticket_count').notNull(),
  num_previous_contracts: integer('num_previous_contracts').notNull(),
  contract_end_date: text('contract_end_date').notNull(),
  contract_length_days: integer('contract_length_days').notNull(),
  contract_start_date: text('contract_start_date').notNull(),
  tier: text('tier').notNull(),
  product: text('product').notNull(),
  feature_adoption_score: real('feature_adoption_score').notNull(),
  churned: integer('churned').notNull(),
});

export const normalizationMappings = sqliteTable('normalization_mappings', {
  canonical_field: text('canonical_field').primaryKey(),
  raw_column: text('raw_column'),
  confidence: real('confidence'),
  transform_fn_code: text('transform_fn_code'),
  transform_description: text('transform_description'),
});

export const historicalArr = sqliteTable('historical_arr', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account_id: text('account_id').notNull(),
  quarter: text('quarter').notNull(),
  arr: real('arr').notNull(),
});

export const churnPredictions = sqliteTable('churn_predictions', {
  account_id: text('account_id').primaryKey(),
  churn_probability: real('churn_probability').notNull(),
  churned_predicted: integer('churned_predicted').notNull(),
  feature1_name: text('feature1_name'),
  feature1_shap: real('feature1_shap'),
  feature1_direction: text('feature1_direction'),
  feature2_name: text('feature2_name'),
  feature2_shap: real('feature2_shap'),
  feature2_direction: text('feature2_direction'),
});

export const qualificationConfig = sqliteTable('qualification_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  description: text('description'),
});

export const qualificationResults = sqliteTable('qualification_results', {
  account_id: text('account_id').primaryKey(),
  signal: text('signal').notNull(),
  status_color: text('status_color').notNull(),
  recommended_action: text('recommended_action').notNull(),
  reasons: text('reasons').notNull(),
  updated_at: text('updated_at').notNull(),
  is_new: integer('is_new').notNull().default(0),
});

export const productFeatures = sqliteTable('product_features', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  product: text('product').notNull(),
  feature_name: text('feature_name').notNull(),
  release_date: text('release_date').notNull(),
  description: text('description'),
});
