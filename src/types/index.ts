export type UserRole = 'caregiver' | 'elderly' | 'patient';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  isDemo?: boolean;
  setupCompleted?: boolean;
  phone?: string;
  phoneNumber?: string;
  phone_number?: string;
  relationship?: string;
  caregivingRelationship?: string;
  caregiving_relationship?: string;
  preferredLanguage?: string;
  preferred_language?: string;
}

export interface CaregiverPatientRelation {
  id: string;
  caregiverId: string;
  caregiverName: string;
  caregiverEmail?: string;
  patientId: string;
  relationship: string;
  status: 'active' | 'pending' | 'revoked';
  isPrimary: boolean;
  createdAt: string;
}

export interface CaregiverProfile {
  id: string;
  userId: string;
  name: string;
  email?: string;
  age?: number;
  relationship?: string;
  relationshipWithElderly?: string;
  caregivingRelationship?: string;
  phone?: string;
  phoneNumber?: string;
  preferredLanguage: string;
  photoUrl?: string;
}

export interface ElderlyProfile {
  id: string;
  caregiverId?: string;
  name: string;
  age: number;
  dateOfBirth?: string;
  gender?: string;
  state: string;
  preferredLanguage: string;
  phone?: string;
  emergencyContact: string;
  relationship?: string;
  caregiverName: string;
  dailyWakeUpTime: string;
  preferredActivityTime: string;
  photoUrl?: string;
}

export interface FamiliarPerson {
  id: string;
  name: string;
  relationship: string;
  photoUrl: string;
  notes?: string;
}

export interface FamiliarPlace {
  id: string;
  name: string;
  description: string;
  photoUrl?: string;
}

export interface RoutineItem {
  id: string;
  time: string;
  activity: string;
  description?: string;
  category: 'morning' | 'afternoon' | 'evening' | 'night';
}

export interface Reminder {
  id: string;
  title: string;
  time: string;
  repeat: 'daily' | 'weekly' | 'once';
  description?: string;
  category: 'activity' | 'routine' | 'visit' | 'medication' | 'general';
  isCompleted: boolean;
  createdAt: string;
}

export type GameType =
  | 'memory-match'
  | 'sequence-recall'
  | 'name-face'
  | 'familiar-places'
  | 'number-memory'
  | 'voice-recall'
  | 'object-recall'
  | 'story-recall'
  | 'familiar-sounds';

export type CognitiveCategory = 'memory' | 'attention' | 'recognition' | 'recall' | 'language' | 'familiarity';

export interface GameSession {
  id: string;
  gameId: GameType;
  gameTitle: string;
  category: CognitiveCategory;
  score: number;
  accuracy: number;
  timeSeconds: number;
  difficultyLevel: number;
  timestamp: string;
  attempts?: number;
  xpEarned?: number;
  mindPointsEarned?: number;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt?: string;
  isUnlocked: boolean;
}

export interface GamificationProfile {
  xp: number;
  mindPoints: number;
  userLevel: number;
  currentStreak: number;
  lastActiveDate: string;
  unlockedBadges: Badge[];
}

export interface CategoryScores {
  memory: number;
  attention: number;
  recognition: number;
  recall: number;
  language: number;
  familiarity: number;
}

export interface CognitiveActivityProfile {
  totalActivities: number;
  weeklyCount: number;
  averageAccuracy: number;
  currentStreak: number;
  categoryScores: CategoryScores;
  aiRecommendation: string;
  aiInsights: Array<{
    id: string;
    title: string;
    description: string;
    type: 'positive' | 'recommendation' | 'insight' | 'trend';
    iconName: string;
  }>;
}

export interface DeviceConnection {
  id: string;
  token: string;
  caregiverName: string;
  elderlyName: string;
  connectedAt: string;
  status: 'online' | 'offline';
  lastSync: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'reminder';
  timestamp: string;
  read: boolean;
}

export interface AccessibilitySettings {
  textSize: 'small' | 'medium' | 'large';
  highContrast: boolean;
  voiceGuidance: boolean;
}

export interface MedicalCondition {
  id: string;
  name: string;
  diagnosedYear?: number;
  notes?: string;
}

export interface Medication {
  id: string;
  name: string;
  dosage?: string;
  frequency?: string;
  time?: string;
  purpose?: string;
  doctorName?: string;
  notes?: string;
}

export interface EmergencyContactInfo {
  primaryContactName: string;
  primaryContactPhone: string;
  primaryCaregiverName: string;
  relationship?: string;
  doctorName?: string;
  hospitalName?: string;
  allergies?: string[];
  importantNotes?: string;
}

export type DifficultyLevelOption = 'none' | 'occasional' | 'needs_assistance' | 'regular_support';

export interface DailyFunctionProfile {
  memoryDifficulty: DifficultyLevelOption;
  attentionDifficulty: DifficultyLevelOption;
  peopleRecognitionDifficulty: DifficultyLevelOption;
  placeRecognitionDifficulty: DifficultyLevelOption;
  routineDifficulty: DifficultyLevelOption;
  communicationDifficulty: DifficultyLevelOption;
  dailyTaskDifficulty: DifficultyLevelOption;
}

export interface MedicalDocument {
  id: string;
  name: string;
  type?: string;
  dateAdded?: string;
}

export interface PatientProfile {
  id: string;
  basicInfo: {
    name: string;
    dateOfBirth?: string;
    age: number;
    gender?: string;
    state: string;
    language: string;
    phone?: string;
    photo?: string;
  };
  medicalHistory: {
    conditions: MedicalCondition[];
    neurologicalHistory: string[];
    surgeries: string[];
    hospitalizations: string[];
    allergies: string[];
    documents?: MedicalDocument[];
    visionDifficulties?: boolean;
    hearingDifficulties?: boolean;
    speechDifficulties?: boolean;
    mobilityLimitations?: boolean;
    sleepDifficulties?: boolean;
    notes?: string;
  };
  medications: Medication[];
  dailyRoutine: RoutineItem[];
  cognitiveProfile: CategoryScores;
  dailyFunction: DailyFunctionProfile;
  caregiverObservations: string[];
  emergencyContact?: EmergencyContactInfo;
  patientCredentials?: {
    loginId: string;
    password?: string;
  };
  accessibility: {
    largeText: boolean;
    highContrast: boolean;
    voiceEnabled: boolean;
    reduceMotion: boolean;
  };
  gamification: GamificationProfile;
  familiarPeople?: FamiliarPerson[];
  familiarPlaces?: FamiliarPlace[];
}

/* ─────────────────────────────────────────────────────────────
 * ACCURACY-BASED SOS & ALERT TYPES
 * ───────────────────────────────────────────────────────────── */

export type SOSSource = 'accuracy' | 'manual';
export type SOSLevel = 'none' | 'caution' | 'sos';
export type SOSStatus = 'active' | 'acknowledged' | 'resolved';

export interface SOSAlert {
  id: string;
  patientId: string;
  patientName: string;
  type: 'SOS';
  source: SOSSource;
  level: SOSLevel;
  accuracy: number | null; // number for accuracy, null for manual
  timestamp: number;
  status: SOSStatus;
}

/* ─────────────────────────────────────────────────────────────
 * MACHINE LEARNING COGNITIVE ANALYSIS & LONGITUDINAL PREDICTION
 * ───────────────────────────────────────────────────────────── */

export type MLCognitiveCategory = 'cognitively_unimpaired' | 'mild_cognitive_impairment' | 'dementia' | 'insufficient_data';
export type MLTrajectory = 'stable' | 'improving' | 'declining' | 'insufficient_data';

export interface MLCategoryProbabilities {
  cognitively_unimpaired: number;
  mild_cognitive_impairment: number;
  dementia: number;
}

export interface MLFeatureExplanation {
  featureName: string;
  description: string;
  impactDirection: 'positive' | 'negative' | 'neutral';
  relativeContribution: number; // e.g. 0.0 to 1.0
}

export interface MLFeatureSnapshot {
  totalSessions: number;
  accuracyLast5: number | null;
  accuracyLast10: number | null;
  accuracy7d: number | null;
  accuracy30d: number | null;
  accuracySlope30d: number | null;
  scoreSlope: number | null;
  accuracyMean: number | null;
  accuracyStd: number | null;
  averageDurationSeconds: number | null;
  durationTrend: string | null;
  currentDifficulty: number;
  gamesPerWeek: number;
  dominantCategoryAccuracy?: Record<string, number>;
}

export interface MLCognitivePrediction {
  id: string;
  patientId: string;
  patientName?: string;
  modelVersion: string;
  predictionType: string;
  predictedCategory: MLCognitiveCategory;
  trajectory: MLTrajectory;
  predictionHorizonDays: number; // e.g. 180 days (6 months)
  confidence: number;
  categoryProbabilities: MLCategoryProbabilities;
  featuresSnapshot: MLFeatureSnapshot;
  explanation: MLFeatureExplanation[];
  insufficientDataReason?: string;
  createdAt: string;
  updatedAt?: string;
}

/* ─────────────────────────────────────────────────────────────
 * DOCTOR APPOINTMENT BOOKING
 * ───────────────────────────────────────────────────────────── */

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'rescheduled'
  | 'completed'
  | 'cancelled';

export type AppointmentType = 'in_person' | 'video';

export interface Doctor {
  id: string;
  name: string;
  specialization: string;
  hospital?: string;
  phone?: string;
  consultationType: 'in_person' | 'video' | 'both';
  available: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName?: string;
  caregiverId: string;
  caregiverName?: string;
  doctorId: string;
  doctor?: Doctor;
  appointmentDate: string; // YYYY-MM-DD
  appointmentTime: string; // HH:MM or HH:MM AM/PM
  appointmentType: AppointmentType;
  reason?: string;
  notes?: string;
  status: AppointmentStatus;
  hospital?: string;
  meetingLink?: string;
  cancelledAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus?: 'synced' | 'pending' | 'failed';
}
