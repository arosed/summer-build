import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

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
  tone: integer('tone').notNull().default(1),
});

export const historicalArr = sqliteTable('historical_arr', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account_id: text('account_id').notNull(),
  quarter: text('quarter').notNull(),
  arr: real('arr').notNull(),
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
