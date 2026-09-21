import React, { useState, useEffect } from 'react';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  AlertCircle,
  Clock,
  RefreshCw,
  WifiOff,
  Sparkles,
  Info,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { MLCognitivePrediction, GameSession } from '../types';
import { MLPredictionService } from '../services/mlPredictionService';

interface CognitiveAnalysisCardProps {
  patientId: string;
  patientName?: string;
  patientAge?: number;
  sessions?: GameSession[];
}

export const CognitiveAnalysisCard: React.FC<CognitiveAnalysisCardProps> = ({
  patientId,
  patientName,
  patientAge = 72,
  sessions = [],
}) => {
  const [prediction, setPrediction] = useState<MLCognitivePrediction | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchAnalysis = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setErrorMessage(null);

    const offlineStatus = typeof navigator !== 'undefined' && !navigator.onLine;
    setIsOffline(offlineStatus);

    try {
      const result = await MLPredictionService.evaluatePatient(patientId, {
        forceRefresh: force,
        patientName,
        sessions,
        age: patientAge,
      });
      setPrediction(result);
    } catch (err: any) {
      console.warn('Could not fetch ML analysis:', err);
      // Try offline fallback
      const cached = await MLPredictionService.getCachedPrediction(patientId);
      if (cached) {
        setPrediction(cached);
        setIsOffline(true);
      } else {
        setErrorMessage(
          'Cognitive analysis service currently warming up or offline. Please check connection.'
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();

    // Subscribe to realtime updates if cloud database is configured
    const unsubscribe = MLPredictionService.subscribeToRealtimePredictions(patientId, (newPred) => {
      setPrediction(newPred);
      setIsOffline(false);
    });

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [patientId, sessions.length]);

  // Session count
  const sessionCount = sessions.length;
  const isInsufficient = prediction?.predictedCategory === 'insufficient_data' || sessionCount < 3;

  // Chart data from real sessions
  const chartData = [...sessions]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((s, idx) => ({
      index: idx + 1,
      name: `S${idx + 1}`,
      date: new Date(s.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      accuracy: Math.round(Number(s.accuracy) || 0),
      game: s.gameTitle || s.gameId,
    }));

  // Category visual helper
  const getCategoryBadge = (cat?: string) => {
    switch (cat) {
      case 'cognitively_unimpaired':
        return {
          title: 'Stable Baseline Performance',
          subtitle: 'Age-appropriate cognitive indicators within normal parameters',
          bg: 'bg-[#DDE9D9]',
          border: 'border-[#B7D4CC]',
          text: 'text-[#176B61]',
          badge: 'bg-[#176B61] text-white',
        };
      case 'mild_cognitive_impairment':
        return {
          title: 'Mild Cognitive Variance Signal',
          subtitle: 'Subtle shifts in short-term recall or processing speed detected',
          bg: 'bg-[#F4E4C8]',
          border: 'border-[#E4DED4]',
          text: 'text-[#8A5A1E]',
          badge: 'bg-[#C58B35] text-white',
        };
      case 'dementia':
        return {
          title: 'Elevated Cognitive-Risk Signal',
          subtitle: 'Consistent performance decline across multiple cognitive sessions',
          bg: 'bg-[#EFD4D3]',
          border: 'border-[#CD9C8A]',
          text: 'text-[#A54545]',
          badge: 'bg-[#D9534F] text-white',
        };
      default:
        return {
          title: 'Collecting Baseline Data',
          subtitle: 'Additional game sessions required',
          bg: 'bg-[#FAF9F4]',
          border: 'border-[#E4DED4]',
          text: 'text-[#66736D]',
          badge: 'bg-[#66736D] text-white',
        };
    }
  };

  // Trajectory visual helper
  const getTrajectoryBadge = (traj?: string) => {
    switch (traj) {
      case 'improving':
        return {
          label: 'Improving Performance',
          icon: <TrendingUp className="w-4 h-4 text-[#176B61]" />,
          color: 'text-[#176B61] bg-[#DDE9D9] border-[#B7D4CC]',
        };
      case 'declining':
        return {
          label: 'Declining Trend (Follow Up Suggested)',
          icon: <TrendingDown className="w-4 h-4 text-[#A54545]" />,
          color: 'text-[#A54545] bg-[#EFD4D3] border-[#CD9C8A]',
        };
      case 'stable':
      default:
        return {
          label: 'Stable Horizon (Next 6 Months)',
          icon: <Minus className="w-4 h-4 text-[#176B61]" />,
          color: 'text-[#176B61] bg-[#DCEEEF] border-[#B7D4CC]',
        };
    }
  };

  const catStyle = getCategoryBadge(prediction?.predictedCategory);
  const trajStyle = getTrajectoryBadge(prediction?.trajectory);

  return (
    <div className="bg-white rounded-3xl border border-[#E4DED4] shadow-sm overflow-hidden space-y-5 p-6 sm:p-8">
      {/* ── CARD HEADER & MEDICAL DISCLAIMER BANNER ─────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#E4DED4] pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="bg-[#176B61] text-white text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-[#F4EBD7]" /> Longitudinal Machine Learning Module
            </span>
            <span className="bg-[#DCEEEF] text-[#176B61] text-xs font-extrabold px-3 py-1 rounded-full border border-[#B7D4CC]">
              Horizon: 180 Days (6 Months)
            </span>
            {isOffline && (
              <span className="bg-[#FAF9F4] text-[#8A5A1E] text-xs font-extrabold px-3 py-1 rounded-full border border-[#E4DED4] flex items-center gap-1">
                <WifiOff className="w-3 h-3 text-[#C58B35]" /> Offline Cached View
              </span>
            )}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#26332F] flex items-center gap-2">
            <Brain className="w-7 h-7 text-[#176B61]" /> Cognitive Analysis & Longitudinal Prediction
          </h2>
          <p className="text-xs text-[#66736D] font-medium mt-1">
            Longitudinal trend analytics and trajectory estimation for{' '}
            <strong>{patientName || 'Active Patient'}</strong>.
          </p>
        </div>

        <button
          onClick={() => fetchAnalysis(true)}
          disabled={refreshing || loading}
          className="px-4 py-2.5 bg-[#FAF9F4] hover:bg-[#F4EBD7] text-[#176B61] border border-[#B7D4CC] font-extrabold text-xs rounded-2xl transition flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Analyzing...' : 'Re-analyze Trends'}
        </button>
      </div>

      {/* Strict Medical Safety Callout */}
      <div className="bg-[#FAF9F4] border border-[#E4DED4] rounded-2xl p-3.5 flex items-start gap-3 text-xs text-[#26332F]">
        <Info className="w-4 h-4 text-[#176B61] shrink-0 mt-0.5" />
        <div>
          <span className="font-extrabold text-[#176B61] uppercase tracking-wide mr-1">
            Decision-Support Research Notice:
          </span>
          This algorithmic module provides statistical performance estimates to assist caregivers in tracking activity patterns.
          It does <strong>NOT</strong> diagnose dementia or any neurological illness. Always consult a licensed neurologist or physician for clinical assessments.
        </div>
      </div>

      {/* Offline Status Timestamp Banner */}
      {isOffline && prediction?.createdAt && (
        <div className="bg-[#F4EBD7] border border-[#E4DED4] rounded-2xl p-3 text-xs font-semibold text-[#26332F] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-[#C58B35]" />
            <span>
              Status: Offline — showing last available analysis from{' '}
              <strong>{new Date(prediction.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong>
            </span>
          </div>
          <span className="text-[10px] text-[#66736D] uppercase">Cached locally in Dexie</span>
        </div>
      )}

      {/* Error State */}
      {errorMessage && (
        <div className="bg-[#EFD4D3] border border-[#CD9C8A] rounded-2xl p-4 text-xs font-bold text-[#A54545] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !prediction && (
        <div className="py-12 text-center space-y-3">
          <div className="w-10 h-10 border-3 border-[#176B61] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-[#26332F]">Evaluating longitudinal cognitive data points...</p>
          <p className="text-xs text-[#66736D]">Running calibrated OASIS-2 cross-validation models</p>
        </div>
      )}

      {/* ── INSUFFICIENT DATA STATE (< 3 SESSIONS) ─────────────────── */}
      {!loading && isInsufficient && (
        <div className="bg-[#FAF9F4] border-2 border-dashed border-[#E4DED4] rounded-3xl p-6 sm:p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#DCEEEF] text-[#176B61] flex items-center justify-center mx-auto border border-[#B7D4CC]">
            <Activity className="w-8 h-8 text-[#176B61]" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <span className="bg-[#F4EBD7] text-[#26332F] text-[11px] font-black uppercase px-3 py-1 rounded-full border border-[#E4DED4]">
              Data Accumulation in Progress
            </span>
            <h3 className="text-xl font-black text-[#26332F]">
              Minimum 3 Cognitive Sessions Required
            </h3>
            <p className="text-xs text-[#66736D] leading-relaxed">
              {prediction?.insufficientDataReason ||
                `The patient currently has ${sessionCount} completed session${sessionCount === 1 ? '' : 's'}. To compute an authentic longitudinal trend and avoid false estimates, the system requires at least 3 completed cognitive exercises.`}
            </p>
          </div>

          {/* Progress bar */}
          <div className="max-w-xs mx-auto space-y-1 pt-2">
            <div className="flex justify-between text-xs font-bold text-[#26332F]">
              <span>Sessions Recorded</span>
              <span>{sessionCount} / 3</span>
            </div>
            <div className="w-full bg-[#E4DED4] rounded-full h-3 overflow-hidden">
              <div
                className="bg-[#176B61] h-3 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round((sessionCount / 3) * 100))}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* ── SUFFICIENT DATA STATE (FULL PREDICTION & EXPLANATIONS) ─── */}
      {!loading && !isInsufficient && prediction && (
        <div className="space-y-6">
          {/* Top Metric Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* 1. Model-Estimated Category Card */}
            <div className={`p-5 rounded-3xl border ${catStyle.border} ${catStyle.bg} space-y-3`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#66736D]">
                  Model-Estimated Category
                </span>
                <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${catStyle.badge}`}>
                  Confidence: {Math.round(prediction.confidence * 100)}%
                </span>
              </div>
              <div>
                <h4 className={`text-xl font-black ${catStyle.text}`}>{catStyle.title}</h4>
                <p className="text-xs text-[#26332F]/80 font-medium mt-1 leading-snug">
                  {catStyle.subtitle}
                </p>
              </div>

              {/* Calibrated Probability Bar */}
              <div className="pt-2 border-t border-black/10 space-y-1.5">
                <div className="flex justify-between text-[11px] font-bold text-[#26332F]">
                  <span>Distribution</span>
                  <span>
                    Unimpaired: {Math.round(prediction.categoryProbabilities.cognitively_unimpaired * 100)}% | Mild: {Math.round(prediction.categoryProbabilities.mild_cognitive_impairment * 100)}% | Risk: {Math.round(prediction.categoryProbabilities.dementia * 100)}%
                  </span>
                </div>
                <div className="w-full bg-white/70 rounded-full h-2.5 flex overflow-hidden border border-black/10">
                  <div
                    className="bg-[#176B61] h-2.5"
                    style={{
                      width: `${prediction.categoryProbabilities.cognitively_unimpaired * 100}%`,
                    }}
                    title="Unimpaired"
                  ></div>
                  <div
                    className="bg-[#C58B35] h-2.5"
                    style={{
                      width: `${prediction.categoryProbabilities.mild_cognitive_impairment * 100}%`,
                    }}
                    title="Mild Cognitive Variance"
                  ></div>
                  <div
                    className="bg-[#D9534F] h-2.5"
                    style={{
                      width: `${prediction.categoryProbabilities.dementia * 100}%`,
                    }}
                    title="Elevated Risk"
                  ></div>
                </div>
              </div>
            </div>

            {/* 2. Estimated Future Trajectory (6 Months) */}
            <div className="p-5 rounded-3xl border border-[#E4DED4] bg-[#FAF9F4] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#66736D]">
                  Estimated Trajectory (6 Mos)
                </span>
                <span className="text-[10px] font-black text-[#176B61] bg-[#DDE9D9] px-2.5 py-0.5 rounded-full border border-[#B7D4CC]">
                  Longitudinal
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl border ${trajStyle.color}`}>{trajStyle.icon}</div>
                  <div>
                    <h4 className="text-lg font-black text-[#26332F]">{trajStyle.label}</h4>
                    <span className="text-xs text-[#66736D] font-semibold">
                      Based on multi-session slope & response stability
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#E4DED4] text-xs text-[#66736D] font-medium leading-snug">
                {prediction.trajectory === 'declining'
                  ? '⚠️ Longitudinal drift observed. Consider scheduling a clinical check-up and maintaining daily engagement routines.'
                  : prediction.trajectory === 'improving'
                  ? '✨ Positive learning progression across consecutive game sessions indicates active cognitive engagement.'
                  : '🌿 Stable cognitive indicators over recent evaluations. Continue encouraging balanced routines.'}
              </div>
            </div>

            {/* 3. 30-Day Slope & Velocity Indicator */}
            <div className="p-5 rounded-3xl border border-[#E4DED4] bg-[#FAF9F4] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#66736D]">
                  30-Day Performance Velocity
                </span>
                <span className="text-[10px] font-black text-[#26332F] bg-white px-2.5 py-0.5 rounded-full border border-[#E4DED4]">
                  Trend Slope
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-[#26332F]">
                  {prediction.featuresSnapshot.accuracySlope30d !== null &&
                  prediction.featuresSnapshot.accuracySlope30d !== undefined
                    ? `${prediction.featuresSnapshot.accuracySlope30d > 0 ? '+' : ''}${(
                        prediction.featuresSnapshot.accuracySlope30d * 100
                      ).toFixed(1)}%`
                    : '0.0%'}
                </span>
                <span className="text-xs text-[#66736D] font-bold">/ evaluation period</span>
              </div>

              <div className="pt-2 border-t border-[#E4DED4] grid grid-cols-2 gap-2 text-xs font-bold">
                <div>
                  <span className="text-[10px] text-[#66736D] uppercase block">30d Accuracy</span>
                  <span className="text-sm font-extrabold text-[#176B61]">
                    {prediction.featuresSnapshot.accuracy30d !== null
                      ? `${Math.round(prediction.featuresSnapshot.accuracy30d * 100)}%`
                      : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#66736D] uppercase block">Avg Duration</span>
                  <span className="text-sm font-extrabold text-[#26332F]">
                    {prediction.featuresSnapshot.averageDurationSeconds || 30}s
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── LONGITUDINAL TREND CHART ───────────────────────────── */}
          {chartData.length > 0 && (
            <div className="bg-[#FAF9F4] p-5 sm:p-6 rounded-3xl border border-[#E4DED4] space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#E4DED4] pb-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#176B61] bg-[#DDE9D9] px-2.5 py-0.5 rounded-full border border-[#B7D4CC]">
                    Historical Performance Curve
                  </span>
                  <h3 className="text-lg font-black text-[#26332F] mt-1">
                    Cognitive Accuracy Over Time ({chartData.length} recorded sessions)
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold text-[#66736D]">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-[#176B61]"></span> Session Accuracy
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-[#C58B35]"></span> Caution Line (50%)
                  </span>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E4DED4" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#66736D', fontSize: 11, fontWeight: 'bold' }}
                      axisLine={{ stroke: '#E4DED4' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tick={{ fill: '#66736D', fontSize: 11, fontWeight: 'bold' }}
                      axisLine={{ stroke: '#E4DED4' }}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const p = payload[0].payload;
                          return (
                            <div className="bg-white p-3 rounded-xl border border-[#E4DED4] shadow-md text-xs space-y-1">
                              <p className="font-extrabold text-[#26332F]">{p.game}</p>
                              <p className="text-[#66736D]">Date: {p.date}</p>
                              <p className="font-black text-[#176B61]">Accuracy: {p.accuracy}%</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine y={50} stroke="#C58B35" strokeDasharray="4 4" strokeWidth={1.5} />
                    <ReferenceLine y={30} stroke="#D9534F" strokeDasharray="3 3" strokeWidth={1} />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      stroke="#176B61"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#176B61', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6, fill: '#176B61' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── CONTRIBUTING FACTORS & EXPLAINABILITY SIGNALS ───────── */}
          {prediction.explanation && prediction.explanation.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-extrabold text-[#26332F] uppercase tracking-wide flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#176B61]" /> Key Contributing Indicators (Feature Insights)
                </h4>
                <span className="text-[11px] text-[#66736D] font-medium">Model explainability attribution</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {prediction.explanation.map((item, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-2xl bg-white border border-[#E4DED4] shadow-xs space-y-2 hover:border-[#176B61]/40 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-[#26332F]">{item.featureName}</span>
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          item.impactDirection === 'positive'
                            ? 'bg-[#DDE9D9] text-[#176B61] border border-[#B7D4CC]'
                            : item.impactDirection === 'negative'
                            ? 'bg-[#EFD4D3] text-[#A54545] border border-[#CD9C8A]'
                            : 'bg-[#FAF9F4] text-[#66736D] border border-[#E4DED4]'
                        }`}
                      >
                        {item.impactDirection === 'positive'
                          ? 'Resilience Factor'
                          : item.impactDirection === 'negative'
                          ? 'Elevated Challenge'
                          : 'Neutral Baseline'}
                      </span>
                    </div>

                    <p className="text-xs text-[#66736D] font-medium leading-relaxed">
                      {item.description}
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] text-[#66736D] font-bold uppercase">Weight:</span>
                      <div className="flex-1 bg-[#E4DED4] rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-[#176B61] h-1.5 rounded-full"
                          style={{ width: `${Math.round(item.relativeContribution * 100)}%` }}
                        ></div>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-[#26332F]">
                        {Math.round(item.relativeContribution * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
