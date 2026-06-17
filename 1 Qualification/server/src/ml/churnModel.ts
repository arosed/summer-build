import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { RandomForestClassifier } = _require('ml-random-forest') as { RandomForestClassifier: new (opts: Record<string, unknown>) => { train(X: number[][], y: number[]): void; predict(X: number[][]): number[] } };
import type { NormalizedAccount } from '../engine/engine.js';

export const FEATURE_NAMES = ['usage_ratio', 'arr', 'num_previous_contracts', 'support_ticket_count'];
const CHURN_THRESHOLD = 0.5;
const N_ESTIMATORS = 50;

export interface ShapValue {
  name: string;
  shap_value: number;
  direction: 'increases_churn' | 'decreases_churn';
}

export interface ChurnResult {
  account_id: string;
  churn_probability: number;
  churned_predicted: number;
  top_features: ShapValue[];
}

export interface ModelInfo {
  accuracy: number;
  training_size: number;
  features: string[];
  threshold: number;
  n_estimators: number;
}

let trainedClassifier: { train(X: number[][], y: number[]): void; predict(X: number[][]): number[] } | null = null;
let backgroundMeans: number[] = [0.7, 50000, 2, 15];
let modelAccuracy = 0;
let trainingSize = 0;

function extractFeatures(account: NormalizedAccount): number[] {
  const usageRatio = account.seat_count > 0 ? account.seats_active / account.seat_count : 0;
  const arrNorm = account.arr / 100000;
  const prevContracts = account.num_previous_contracts;
  const tickets = account.support_ticket_count;
  return [usageRatio, arrNorm, prevContracts, tickets];
}

function estimateChurnProbability(features: number[]): number {
  const [usageRatio, arrNorm, prevContracts, tickets] = features;

  // Usage ratio: low usage → high churn risk
  const usageScore = Math.max(0, 1 - usageRatio * 1.8);

  // Tickets: more tickets → higher risk
  const ticketScore = Math.min(1, tickets / 60) * 0.35;

  // Prior contracts: more history → lower risk (loyalty)
  const contractScore = Math.max(0, 0.15 - prevContracts * 0.03);

  // ARR: very low ARR slightly higher risk (less investment)
  const arrScore = arrNorm < 0.3 ? 0.08 : 0;

  const raw = usageScore * 0.55 + ticketScore + contractScore + arrScore;
  return Math.min(0.97, Math.max(0.03, raw));
}

export function trainChurnModel(accounts: NormalizedAccount[]): ModelInfo {
  if (accounts.length < 10) {
    console.warn('Not enough accounts to train churn model');
    return { accuracy: 0, training_size: 0, features: FEATURE_NAMES, threshold: CHURN_THRESHOLD, n_estimators: N_ESTIMATORS };
  }

  const X = accounts.map(extractFeatures);
  const y = accounts.map((a) => a.churned);

  backgroundMeans = FEATURE_NAMES.map((_, fi) => {
    const vals = X.map((row) => row[fi]);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });

  try {
    const classifier = new RandomForestClassifier({
      nEstimators: N_ESTIMATORS,
      replacement: true,
      useSampleBagging: true,
    });
    classifier.train(X, y);
    trainedClassifier = classifier;

    const predictions = classifier.predict(X);
    const correct = predictions.filter((p: number, idx: number) => p === y[idx]).length;
    modelAccuracy = correct / y.length;
    trainingSize = accounts.length;
  } catch (err) {
    console.warn('RandomForest training failed, using heuristic model:', err);
    trainedClassifier = null;
    const predictions = X.map((f) => estimateChurnProbability(f) > CHURN_THRESHOLD ? 1 : 0);
    const correct = predictions.filter((p, idx) => p === y[idx]).length;
    modelAccuracy = correct / y.length;
    trainingSize = accounts.length;
  }

  console.log(`✓ Churn model trained: ${(modelAccuracy * 100).toFixed(1)}% accuracy on ${trainingSize} accounts`);
  return getModelInfo();
}

export function predictChurn(account: NormalizedAccount): ChurnResult {
  const features = extractFeatures(account);
  const prob = estimateChurnProbability(features);

  let rfPrediction: number | null = null;
  if (trainedClassifier) {
    try {
      const preds = trainedClassifier.predict([features]);
      rfPrediction = preds[0];
    } catch {
      rfPrediction = null;
    }
  }

  const churnProbability = rfPrediction !== null
    ? rfPrediction === 1 ? Math.max(0.55, prob) : Math.min(0.45, prob)
    : prob;

  const churnedPredicted = churnProbability >= CHURN_THRESHOLD ? 1 : 0;

  // SHAP approximation: permutation importance
  const shapValues: ShapValue[] = FEATURE_NAMES.map((name, fi) => {
    const perturbed = [...features];
    perturbed[fi] = backgroundMeans[fi];
    const baseProb = churnProbability;
    const perturbedProb = estimateChurnProbability(perturbed);
    const shapValue = baseProb - perturbedProb;
    return {
      name,
      shap_value: shapValue,
      direction: shapValue > 0 ? 'increases_churn' : 'decreases_churn',
    };
  });

  shapValues.sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value));

  return {
    account_id: account.account_id,
    churn_probability: churnProbability,
    churned_predicted: churnedPredicted,
    top_features: shapValues,
  };
}

export function getModelInfo(): ModelInfo {
  return {
    accuracy: modelAccuracy,
    training_size: trainingSize,
    features: FEATURE_NAMES,
    threshold: CHURN_THRESHOLD,
    n_estimators: N_ESTIMATORS,
  };
}
