export interface SeedUser {
  id: string;
  email: string;
  fullName: string;
  birthDate: string;
  timezone: string;
}

export interface SeedContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email: string;
  priority: number;
  notifySms: boolean;
  notifyEmail: boolean;
}

export interface SeedMedication {
  id: string;
  name: string;
  dose: number;
  unit: string;
  scheduleTimes: string[];
  notes: string;
}

export interface SeedMedicationLog {
  medicationId: string;
  scheduledFor: Date;
  takenAt: Date | null;
  status: "taken" | "missed" | "skipped" | "pending";
}

export interface SeedDailyLog {
  logDate: string;
  sleepHours: number;
  stressLevel: number;
  caffeineMg: number;
  exerciseMinutes: number;
  mood: number;
  alcoholUnits: number;
  notes: string | null;
  /** Doses missed that day (used for correlation and risk, not persisted here). */
  missedMeds: number;
}

export interface SeedSeizure {
  id: string;
  startedAt: Date;
  durationSeconds: number;
  severity: number;
  seizureType: string;
  triggersNoted: string[];
  location: string;
  notes: string | null;
  source: "manual" | "emergency" | "wearable";
  resolvedAt: Date;
}

export interface SeedEmergencyEvent {
  id: string;
  seizureId: string | null;
  triggeredAt: Date;
  status: "resolved" | "false_alarm" | "active" | "notified";
  latitude: number;
  longitude: number;
  resolvedAt: Date | null;
}

export interface SeedNotification {
  contactId: string;
  eventId: string;
  channel: "email" | "sms";
  payload: Record<string, unknown>;
  status: "sent";
  createdAt: Date;
  sentAt: Date;
}

export interface SeedWearableSample {
  sampledAt: Date;
  heartRate: number;
  hrvMs: number;
  spo2: number;
  motionIntensity: number;
  skinTempC: number;
  steps: number;
}

export interface SeedWearableAlert {
  id: string;
  detectedAt: Date;
  kind: "tachycardia" | "motion_convulsive" | "hr_anomaly" | "fall";
  confidence: number;
  payload: Record<string, unknown>;
  convertedEventId: string | null;
}

export interface SeedRisk {
  assessedOn: string;
  score: number;
  level: "low" | "moderate" | "high" | "critical";
  factors: Array<{ name: string; impact: number; direction: "up" | "down"; detail: string }>;
  modelVersion: string;
}

export interface SeedInsight {
  kind: string;
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  createdAt: Date;
}

export interface SeedDataset {
  user: SeedUser;
  contacts: SeedContact[];
  medications: SeedMedication[];
  medicationLogs: SeedMedicationLog[];
  dailyLogs: SeedDailyLog[];
  seizures: SeedSeizure[];
  events: SeedEmergencyEvent[];
  notifications: SeedNotification[];
  device: { id: string; provider: "fitbit"; deviceName: string; externalId: string };
  samples: SeedWearableSample[];
  alerts: SeedWearableAlert[];
  risks: SeedRisk[];
  insights: SeedInsight[];
}
