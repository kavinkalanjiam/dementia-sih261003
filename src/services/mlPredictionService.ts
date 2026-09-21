/**
 * SIROI Machine Learning Prediction Service
 * Communicates with the FastAPI ML Cognitive Analysis Service (/api/ml).
 * Handles offline caching via Dexie and Realtime cloud sync with Supabase.
 * Strictly maintains non-diagnostic, decision-support semantics.
 */
import { MLCognitivePrediction, GameSession } from '../types';
import { saveMLPrediction, getLatestMLPrediction } from '../offline/offlineStorage';
import { LocalMLPrediction } from '../offline/db';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { StorageService } from './storage';

export interface MLPredictionState {
  prediction: MLCognitivePrediction | null;
  loading: boolean;
  error: string | null;
  isOffline: boolean;
  lastUpdated: string | null;
}

export class MLPredictionService {
  private static baseUrl = '/api/ml';

  /**
   * Fetches or triggers an ML cognitive evaluation for the patient.
   */
  static async evaluatePatient(
    patientId: string,
    options?: {
      forceRefresh?: boolean;
      patientName?: string;
      sessions?: GameSession[];
      age?: number;
    }
  ): Promise<MLCognitivePrediction> {
    // 1. If device is explicitly offline, retrieve from local Dexie / localStorage immediately
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = await this.getCachedPrediction(patientId);
      if (cached) return cached;
    }

    // 2. Prepare attempts snapshot from passed sessions or StorageService
    let sessions = options?.sessions;
    if (!sessions || sessions.length === 0) {
      sessions = StorageService.getGameSessions(patientId);
    }

    // Format attempts for the ML backend
    const attemptsPayload = (sessions || []).map((s) => ({
      game_type: s.gameId,
      score: Number(s.score) || 0,
      accuracy: Number(s.accuracy) || 0,
      duration_seconds: Number(s.timeSeconds) || 30,
      difficulty_level: Number(s.difficultyLevel) || 1,
      created_at: s.timestamp,
      total_questions: s.attempts || 1,
      correct_answers: Math.round(((Number(s.accuracy) || 0) / 100) * (s.attempts || 1)),
    }));

    const body = {
      patient_id: patientId,
      patient_name: options?.patientName,
      attempts: attemptsPayload,
      demographics: {
        age: options?.age || 72,
        education_years: 14,
      },
    };

    try {
      const res = await fetch(`${this.baseUrl}/predict/${encodeURIComponent(patientId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`ML Service responded with status ${res.status}`);
      }

      const data: MLCognitivePrediction = await res.json();

      // Cache into local Dexie store for complete offline resilience
      try {
        const localRecord: LocalMLPrediction = {
          id: data.id,
          patient_id: data.patientId,
          model_version: data.modelVersion,
          prediction_type: data.predictionType,
          predicted_category: data.predictedCategory,
          trajectory: data.trajectory,
          prediction_horizon_days: data.predictionHorizonDays,
          confidence: data.confidence,
          category_probabilities: data.categoryProbabilities,
          features_snapshot: data.featuresSnapshot,
          explanation: data.explanation,
          insufficient_data_reason: data.insufficientDataReason,
          created_at: data.createdAt,
        };
        await saveMLPrediction(localRecord);
        if (typeof window !== 'undefined') {
          localStorage.setItem(`siroi_latest_ml_pred_${patientId}`, JSON.stringify(data));
        }
      } catch (cacheErr) {
        console.warn('[MLPredictionService] Cache write warning:', cacheErr);
      }

      return data;
    } catch (networkErr) {
      console.warn('[MLPredictionService] API request failed, checking local cache:', networkErr);
      const cached = await this.getCachedPrediction(patientId);
      if (cached) {
        return cached;
      }
      throw networkErr;
    }
  }

  /**
   * Retrieves the latest cached ML prediction from Dexie or localStorage.
   */
  static async getCachedPrediction(patientId: string): Promise<MLCognitivePrediction | null> {
    try {
      // Primary: Dexie IndexedDB
      const dexieRecord = await getLatestMLPrediction(patientId);
      if (dexieRecord) {
        return {
          id: dexieRecord.id,
          patientId: dexieRecord.patient_id,
          patientName: dexieRecord.patient_name,
          modelVersion: dexieRecord.model_version,
          predictionType: dexieRecord.prediction_type,
          predictedCategory: dexieRecord.predicted_category as any,
          trajectory: dexieRecord.trajectory as any,
          predictionHorizonDays: dexieRecord.prediction_horizon_days,
          confidence: dexieRecord.confidence,
          categoryProbabilities: dexieRecord.category_probabilities,
          featuresSnapshot: dexieRecord.features_snapshot,
          explanation: dexieRecord.explanation,
          insufficientDataReason: dexieRecord.insufficient_data_reason,
          createdAt: dexieRecord.created_at,
          updatedAt: dexieRecord.updated_at,
        };
      }

      // Secondary: localStorage
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(`siroi_latest_ml_pred_${patientId}`);
        if (raw) {
          return JSON.parse(raw) as MLCognitivePrediction;
        }
      }
    } catch (e) {
      console.warn('[MLPredictionService] Error reading cached prediction:', e);
    }
    return null;
  }

  /**
   * Subscribes to Supabase Realtime updates on ml_predictions table.
   */
  static subscribeToRealtimePredictions(
    patientId: string,
    callback: (prediction: MLCognitivePrediction) => void
  ): () => void {
    if (!isSupabaseConfigured()) {
      return () => {};
    }

    try {
      const channel = supabase
        .channel(`ml_predictions_channel_${patientId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'ml_predictions',
            filter: `patient_id=eq.${patientId}`,
          },
          (payload: any) => {
            const row = payload.new;
            if (row) {
              const parsed: MLCognitivePrediction = {
                id: row.id,
                patientId: row.patient_id,
                modelVersion: row.model_version,
                predictionType: row.prediction_type,
                predictedCategory: row.predicted_category,
                trajectory: row.trajectory,
                predictionHorizonDays: row.prediction_horizon_days,
                confidence: Number(row.confidence) || 0,
                categoryProbabilities: row.category_probabilities || {
                  cognitively_unimpaired: 0,
                  mild_cognitive_impairment: 0,
                  dementia: 0,
                },
                featuresSnapshot: row.features_snapshot,
                explanation: row.explanation || [],
                insufficientDataReason: row.insufficient_data_reason,
                createdAt: row.created_at,
              };
              callback(parsed);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (e) {
      console.warn('[MLPredictionService] Realtime subscription error:', e);
      return () => {};
    }
  }
}
