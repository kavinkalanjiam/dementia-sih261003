// SIROI Doctor Appointment Booking Service
// Robust offline-first implementation with local caching, 24h time formatting, and Realtime sync

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { db, LocalAppointment, LocalDoctor } from '../offline/db';
import { OfflineStorage } from '../offline/offlineStorage';
import { SyncQueue } from '../offline/syncQueue';
import { notifySyncEvent, subscribeToSync } from './realtime';
import { StorageService } from './storage';
import { generateUUID } from '../utils/uuid';
import { Appointment, AppointmentStatus, AppointmentType, Doctor } from '../types';

const LOCAL_STORAGE_KEY = 'mindcare_appointments_local';

// Default regional healthcare specialists (aligned with migration 008 IDs)
export const DEFAULT_DOCTORS: Doctor[] = [
  {
    id: 'd0c10001-0000-0000-0000-000000000001',
    name: 'Dr. P. Barua',
    specialization: 'Neurology & Cognitive Health',
    hospital: 'Guwahati Medical College & Hospital (GMCH)',
    phone: '+91 94350 12345',
    consultationType: 'both',
    available: true,
  },
  {
    id: 'd0c10001-0000-0000-0000-000000000002',
    name: 'Dr. Arun Sharma',
    specialization: 'Geriatric Medicine',
    hospital: 'Downtown Hospital, Guwahati',
    phone: '+91 94351 23456',
    consultationType: 'both',
    available: true,
  },
  {
    id: 'd0c10001-0000-0000-0000-000000000003',
    name: 'Dr. Meena Das',
    specialization: 'Psychiatry & Memory Clinic',
    hospital: 'NEIGRIHMS, Shillong',
    phone: '+91 94352 34567',
    consultationType: 'both',
    available: true,
  },
  {
    id: 'd0c10001-0000-0000-0000-000000000004',
    name: 'Dr. Rajesh Roy',
    specialization: 'General Medicine & Elder Care',
    hospital: 'Apollo Clinic, Silchar',
    phone: '+91 94353 45678',
    consultationType: 'in_person',
    available: true,
  },
];

// Helper to check for valid UUID format
function isValidUUID(val?: string): boolean {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

// Helper to convert 12-hour AM/PM time into PostgreSQL 24-hour TIME format (HH:MM:SS)
export function formatTimeTo24h(timeStr: string): string {
  if (!timeStr) return '10:00:00';
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const modifier = match[3] ? match[3].toUpperCase() : null;
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
  }
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00`;
  }
  return trimmed;
}

// Helper to map DB row or LocalDoctor to Doctor
function mapToDoctor(d: any): Doctor {
  return {
    id: d.id,
    name: d.name,
    specialization: d.specialization || 'General Physician',
    hospital: d.hospital || 'SIROI Health Network',
    phone: d.phone,
    consultationType: d.consultation_type || d.consultationType || 'both',
    available: d.available !== false,
    createdAt: d.created_at || d.createdAt,
    updatedAt: d.updated_at || d.updatedAt,
  };
}

// Helper to map DB row or LocalAppointment to Appointment
function mapToAppointment(a: any, doctorsMap?: Map<string, Doctor>): Appointment {
  const doctor = doctorsMap?.get(a.doctor_id || a.doctorId) || (a.doctor ? mapToDoctor(a.doctor) : undefined);
  return {
    id: a.id,
    patientId: a.patient_id || a.patientId,
    patientName: a.patient_name || a.patientName,
    caregiverId: a.caregiver_id || a.caregiverId,
    caregiverName: a.caregiver_name || a.caregiverName,
    doctorId: a.doctor_id || a.doctorId,
    doctor,
    appointmentDate: a.appointment_date || a.appointmentDate,
    appointmentTime: a.appointment_time || a.appointmentTime,
    appointmentType: a.appointment_type || a.appointmentType || 'in_person',
    reason: a.reason || '',
    notes: a.notes || '',
    status: (a.status || 'confirmed') as AppointmentStatus,
    hospital: a.hospital || doctor?.hospital || 'SIROI Health Network',
    meetingLink: a.meeting_link || a.meetingLink,
    cancelledAt: a.cancelled_at || a.cancelledAt,
    completedAt: a.completed_at || a.completedAt,
    createdAt: a.created_at || a.createdAt || new Date().toISOString(),
    updatedAt: a.updated_at || a.updatedAt || new Date().toISOString(),
    syncStatus: (a.sync_status || a.syncStatus || 'synced') as 'synced' | 'pending' | 'failed',
  };
}

// Synchronous local storage helpers for instant rendering
function getLocalStorageAppointments(): LocalAppointment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalStorageAppointments(items: LocalAppointment[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export const AppointmentService = {
  /**
   * Get all active doctors. Falls back to Dexie cache, then DEFAULT_DOCTORS.
   */
  async getDoctors(): Promise<Doctor[]> {
    try {
      if (isSupabaseConfigured() && navigator.onLine) {
        const { data, error } = await supabase
          .from('doctors')
          .select('*')
          .order('name', { ascending: true });

        if (!error && data && data.length > 0) {
          const docs: Doctor[] = data.map(mapToDoctor);
          // Cache in IndexedDB
          for (const d of data) {
            await OfflineStorage.saveDoctor({
              id: d.id,
              name: d.name,
              specialization: d.specialization,
              hospital: d.hospital,
              phone: d.phone,
              consultation_type: d.consultation_type,
              available: d.available,
              created_at: d.created_at,
              updated_at: d.updated_at,
            });
          }
          return docs;
        }
      }
    } catch (e) {
      console.warn('Could not fetch doctors from cloud, using offline cache', e);
    }

    // Try IndexedDB
    try {
      const localDocs = await OfflineStorage.getDoctors();
      if (localDocs && localDocs.length > 0) {
        return localDocs.map(mapToDoctor);
      }
    } catch (e) {
      console.warn('Error reading doctors from Dexie', e);
    }

    // Seed default doctors into IndexedDB for offline resilience
    try {
      for (const d of DEFAULT_DOCTORS) {
        await OfflineStorage.saveDoctor({
          id: d.id,
          name: d.name,
          specialization: d.specialization,
          hospital: d.hospital,
          phone: d.phone,
          consultation_type: d.consultationType,
          available: d.available,
        });
      }
    } catch (_) {}

    return DEFAULT_DOCTORS;
  },

  /**
   * Get doctor by ID.
   */
  async getDoctorById(id: string): Promise<Doctor | undefined> {
    const doctors = await this.getDoctors();
    return doctors.find(d => d.id === id);
  },

  /**
   * Retrieve appointments.
   * Merges local Dexie/LocalStorage appointments with Supabase cloud records.
   * If offline or cloud returns 0 records, preserves all local records!
   */
  async getAppointments(patientId?: string): Promise<Appointment[]> {
    const doctors = await this.getDoctors();
    const doctorsMap = new Map<string, Doctor>(doctors.map(d => [d.id, d]));

    // 1. Gather all local appointments from Dexie and LocalStorage
    let localList: LocalAppointment[] = [];
    try {
      localList = await OfflineStorage.getAppointments(patientId);
    } catch (err) {
      console.warn('Dexie read error, falling back to localStorage', err);
    }

    const lsList = getLocalStorageAppointments();
    const localMap = new Map<string, LocalAppointment>();

    // Load from local storage
    for (const item of lsList) {
      if (!patientId || item.patient_id === patientId) {
        localMap.set(item.id, item);
      }
    }
    // Overlay Dexie items
    for (const item of localList) {
      if (!patientId || item.patient_id === patientId) {
        localMap.set(item.id, item);
      }
    }

    // 2. Query Supabase if online
    let cloudList: any[] = [];
    let cloudSuccess = false;

    if (isSupabaseConfigured() && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        let query = supabase
          .from('appointments')
          .select('*, doctor:doctors(*)')
          .order('appointment_date', { ascending: true })
          .order('appointment_time', { ascending: true });

        if (patientId) {
          query = query.eq('patient_id', patientId);
        }

        const { data, error } = await query;

        if (!error && Array.isArray(data)) {
          cloudSuccess = true;
          cloudList = data;

          // Cache cloud items locally
          for (const item of cloudList) {
            const localItem: LocalAppointment = {
              id: item.id,
              patient_id: item.patient_id,
              caregiver_id: item.caregiver_id,
              doctor_id: item.doctor_id,
              doctor_name: item.doctor?.name,
              specialization: item.doctor?.specialization,
              appointment_date: item.appointment_date,
              appointment_time: item.appointment_time,
              appointment_type: item.appointment_type,
              reason: item.reason,
              notes: item.notes,
              status: item.status,
              hospital: item.hospital || item.doctor?.hospital,
              meeting_link: item.meeting_link,
              cancelled_at: item.cancelled_at,
              completed_at: item.completed_at,
              created_at: item.created_at,
              updated_at: item.updated_at,
              sync_status: 'synced',
            };
            await OfflineStorage.saveAppointment(localItem);
            localMap.set(localItem.id, localItem);
          }
        }
      } catch (e) {
        console.warn('Cloud appointment fetch warning, keeping local records', e);
      }
    }

    // 3. Build merged list
    const combined = Array.from(localMap.values());

    // Sort by date then time
    combined.sort((a, b) => {
      const dateCompare = a.appointment_date.localeCompare(b.appointment_date);
      if (dateCompare !== 0) return dateCompare;
      return a.appointment_time.localeCompare(b.appointment_time);
    });

    return combined.map(l => mapToAppointment(l, doctorsMap));
  },

  /**
   * Schedule a new appointment.
   * Immediately saves locally, enqueues sync, updates reminders, and attempts cloud upsert.
   */
  async createAppointment(params: {
    patientId: string;
    patientName?: string;
    caregiverId: string;
    caregiverName?: string;
    doctorId: string;
    doctorName: string;
    specialization: string;
    hospital?: string;
    appointmentDate: string; // YYYY-MM-DD
    appointmentTime: string; // HH:MM or HH:MM AM/PM
    appointmentType: AppointmentType;
    reason?: string;
    notes?: string;
  }): Promise<Appointment> {
    const id = generateUUID();
    const now = new Date().toISOString();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    // Generate video link if teleconsultation
    const meetingLink = params.appointmentType === 'video'
      ? `https://meet.jit.si/SIROI-${id.substring(0, 8)}`
      : undefined;

    const localItem: LocalAppointment = {
      id,
      patient_id: params.patientId || 'pat-demo-1',
      patient_name: params.patientName || 'Patient',
      caregiver_id: params.caregiverId,
      caregiver_name: params.caregiverName,
      doctor_id: params.doctorId,
      doctor_name: params.doctorName,
      specialization: params.specialization,
      appointment_date: params.appointmentDate,
      appointment_time: params.appointmentTime,
      appointment_type: params.appointmentType,
      reason: params.reason || '',
      notes: params.notes || '',
      status: 'confirmed',
      hospital: params.hospital,
      meeting_link: meetingLink,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    };

    // 1. Save synchronously to LocalStorage for instant UI visibility
    const lsItems = getLocalStorageAppointments();
    const updatedLs = [localItem, ...lsItems.filter(i => i.id !== id)];
    saveLocalStorageAppointments(updatedLs);

    // 2. Save to Dexie database
    try {
      await OfflineStorage.saveAppointment(localItem);
    } catch (err) {
      console.warn('Dexie save error', err);
    }

    // 3. Schedule reminders
    try {
      this.scheduleAppointmentReminders(localItem);
    } catch (err) {
      console.warn('Reminder schedule notice', err);
    }

    // 4. Cloud sync attempt
    if (isOnline && isSupabaseConfigured()) {
      try {
        const timeFormatted = formatTimeTo24h(localItem.appointment_time);
        const payload: Record<string, any> = {
          id: localItem.id,
          patient_id: localItem.patient_id,
          appointment_date: localItem.appointment_date,
          appointment_time: timeFormatted,
          appointment_type: localItem.appointment_type,
          reason: localItem.reason || null,
          notes: localItem.notes || null,
          status: localItem.status,
          hospital: localItem.hospital || null,
          meeting_link: localItem.meeting_link || null,
          created_at: localItem.created_at,
          updated_at: localItem.updated_at,
        };

        // Only include caregiver_id and doctor_id if valid UUIDs for PostgreSQL foreign key constraints
        if (isValidUUID(localItem.caregiver_id)) {
          payload.caregiver_id = localItem.caregiver_id;
        }
        if (isValidUUID(localItem.doctor_id)) {
          payload.doctor_id = localItem.doctor_id;
        }

        const { error } = await supabase.from('appointments').upsert(payload, { onConflict: 'id' });
        if (error) {
          console.warn('Supabase upsert warning (stored locally in Dexie):', error.message);
          await SyncQueue.enqueue('INSERT', 'appointments', id, payload);
        } else {
          localItem.sync_status = 'synced';
          await OfflineStorage.saveAppointment(localItem);
          saveLocalStorageAppointments([localItem, ...lsItems.filter(i => i.id !== id)]);
        }
      } catch (err: any) {
        console.warn('Cloud network notice, queued locally:', err?.message);
        await SyncQueue.enqueue('INSERT', 'appointments', id, localItem);
      }
    } else {
      await SyncQueue.enqueue('INSERT', 'appointments', id, localItem);
    }

    // 5. Notify realtime listeners across all tabs and devices
    const doctors = await this.getDoctors();
    const doctorsMap = new Map<string, Doctor>(doctors.map(d => [d.id, d]));
    const result = mapToAppointment(localItem, doctorsMap);
    notifySyncEvent('mindcare_appointments', result, 'APPOINTMENT_CHANGED');

    return result;
  },

  /**
   * Reschedule an appointment.
   */
  async rescheduleAppointment(
    appointmentId: string,
    newDate: string,
    newTime: string,
    notes?: string
  ): Promise<Appointment> {
    const existing = await OfflineStorage.getAppointmentById(appointmentId) ||
      getLocalStorageAppointments().find(i => i.id === appointmentId);
    const now = new Date().toISOString();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    const updatedNotes = notes
      ? (existing?.notes ? `${existing.notes}\n[Rescheduled: ${notes}]` : notes)
      : existing?.notes;

    const updatedData: Partial<LocalAppointment> = {
      appointment_date: newDate,
      appointment_time: newTime,
      status: 'rescheduled',
      notes: updatedNotes,
      updated_at: now,
      sync_status: 'pending',
    };

    const merged: LocalAppointment = {
      ...(existing || ({} as any)),
      ...updatedData,
      id: appointmentId,
    };

    // 1. Update LocalStorage
    const lsItems = getLocalStorageAppointments();
    saveLocalStorageAppointments(lsItems.map(i => i.id === appointmentId ? merged : i));

    // 2. Update Dexie
    await OfflineStorage.saveAppointment(merged);

    // 3. Reschedule reminders
    this.scheduleAppointmentReminders(merged);

    // 4. Sync to Supabase
    if (isOnline && isSupabaseConfigured()) {
      try {
        const timeFormatted = formatTimeTo24h(newTime);
        const { error } = await supabase
          .from('appointments')
          .update({
            appointment_date: newDate,
            appointment_time: timeFormatted,
            status: 'rescheduled',
            notes: updatedNotes,
            updated_at: now,
          })
          .eq('id', appointmentId);

        if (!error) {
          merged.sync_status = 'synced';
          await OfflineStorage.saveAppointment(merged);
        } else {
          await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatedData);
        }
      } catch (e) {
        await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatedData);
      }
    } else {
      await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatedData);
    }

    const doctors = await this.getDoctors();
    const doctorsMap = new Map<string, Doctor>(doctors.map(d => [d.id, d]));
    const result = mapToAppointment(merged, doctorsMap);
    notifySyncEvent('mindcare_appointments', result, 'APPOINTMENT_CHANGED');

    return result;
  },

  /**
   * Cancel an appointment. Non-destructive: preserves audit trail in DB.
   */
  async cancelAppointment(appointmentId: string, reason?: string): Promise<Appointment> {
    const existing = await OfflineStorage.getAppointmentById(appointmentId) ||
      getLocalStorageAppointments().find(i => i.id === appointmentId);
    const now = new Date().toISOString();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    const cancelNotes = reason
      ? (existing?.notes ? `${existing.notes}\n[Cancelled: ${reason}]` : `Cancelled: ${reason}`)
      : existing?.notes;

    const updatedData: Partial<LocalAppointment> = {
      status: 'cancelled',
      notes: cancelNotes,
      cancelled_at: now,
      updated_at: now,
      sync_status: 'pending',
    };

    const merged: LocalAppointment = {
      ...(existing || ({} as any)),
      ...updatedData,
      id: appointmentId,
    };

    // 1. Update LocalStorage
    const lsItems = getLocalStorageAppointments();
    saveLocalStorageAppointments(lsItems.map(i => i.id === appointmentId ? merged : i));

    // 2. Update Dexie
    await OfflineStorage.updateAppointmentStatus(appointmentId, 'cancelled');
    await OfflineStorage.saveAppointment(merged);

    // 3. Remove routine reminders
    if (existing?.patient_id) {
      this.cleanupAppointmentReminders(appointmentId, existing.patient_id);
    }

    // 4. Sync to Supabase
    if (isOnline && isSupabaseConfigured()) {
      try {
        const { error } = await supabase
          .from('appointments')
          .update({
            status: 'cancelled',
            notes: cancelNotes,
            cancelled_at: now,
            updated_at: now,
          })
          .eq('id', appointmentId);

        if (!error) {
          merged.sync_status = 'synced';
          await OfflineStorage.saveAppointment(merged);
        } else {
          await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatedData);
        }
      } catch (e) {
        await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatedData);
      }
    } else {
      await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatedData);
    }

    const doctors = await this.getDoctors();
    const doctorsMap = new Map<string, Doctor>(doctors.map(d => [d.id, d]));
    const result = mapToAppointment(merged, doctorsMap);
    notifySyncEvent('mindcare_appointments', result, 'APPOINTMENT_CHANGED');

    return result;
  },

  /**
   * Mark appointment completed.
   */
  async completeAppointment(appointmentId: string): Promise<Appointment> {
    const existing = await OfflineStorage.getAppointmentById(appointmentId) ||
      getLocalStorageAppointments().find(i => i.id === appointmentId);
    const now = new Date().toISOString();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    const merged: LocalAppointment = {
      ...(existing || ({} as any)),
      id: appointmentId,
      status: 'completed',
      completed_at: now,
      updated_at: now,
    };

    const lsItems = getLocalStorageAppointments();
    saveLocalStorageAppointments(lsItems.map(i => i.id === appointmentId ? merged : i));
    await OfflineStorage.updateAppointmentStatus(appointmentId, 'completed');
    await OfflineStorage.saveAppointment(merged);

    if (isOnline && isSupabaseConfigured()) {
      try {
        await supabase
          .from('appointments')
          .update({
            status: 'completed',
            completed_at: now,
            updated_at: now,
          })
          .eq('id', appointmentId);
      } catch (e) {
        await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, { status: 'completed', completed_at: now, updated_at: now });
      }
    }

    const doctors = await this.getDoctors();
    const doctorsMap = new Map<string, Doctor>(doctors.map(d => [d.id, d]));
    const result = mapToAppointment(merged, doctorsMap);
    notifySyncEvent('mindcare_appointments', result, 'APPOINTMENT_CHANGED');

    return result;
  },

  /**
   * Schedule appointment reminders.
   */
  scheduleAppointmentReminders(app: Partial<LocalAppointment>): void {
    if (!app.patient_id || !app.appointment_date || !app.appointment_time) return;

    const docName = app.doctor_name || 'Doctor';
    const spec = app.specialization ? ` (${app.specialization})` : '';
    const dateStr = app.appointment_date;
    const timeStr = app.appointment_time;
    const typeLabel = app.appointment_type === 'video' ? 'Video Consultation' : 'In-Person Visit';

    // Day-of reminder
    StorageService.addReminder({
      id: `rem-appt-day-${app.id}`,
      title: `Doctor Visit Today: ${docName}${spec}`,
      time: timeStr,
      category: 'visit',
      repeat: 'once',
      description: `${typeLabel} scheduled at ${timeStr} with ${docName}. Reason: ${app.reason || 'Routine evaluation'}`,
      isCompleted: false,
    }, app.patient_id);

    // 24h prior reminder
    StorageService.addReminder({
      id: `rem-appt-pre-${app.id}`,
      title: `Tomorrow: Doctor Appointment with ${docName}`,
      time: '09:00 AM',
      category: 'visit',
      repeat: 'once',
      description: `Appointment tomorrow (${dateStr}) at ${timeStr} with ${docName}${spec}. Prepare any medical records.`,
      isCompleted: false,
    }, app.patient_id);
  },

  /**
   * Clean up reminders when cancelled.
   */
  cleanupAppointmentReminders(appointmentId: string, patientId: string): void {
    try {
      StorageService.deleteReminder(`rem-appt-day-${appointmentId}`, patientId);
      StorageService.deleteReminder(`rem-appt-pre-${appointmentId}`, patientId);
    } catch (_) {}
  },

  /**
   * Realtime listener.
   */
  subscribe(callback: () => void): () => void {
    return subscribeToSync((payload) => {
      if (payload.key === 'mindcare_appointments' || payload.type === 'APPOINTMENT_CHANGED') {
        callback();
      }
    });
  },
};
