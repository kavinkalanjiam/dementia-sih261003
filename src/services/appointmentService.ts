// SIROI Doctor Appointment Booking Service
// Handles appointment scheduling, rescheduling, cancellations, reminders, and offline sync

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { db, LocalAppointment, LocalDoctor } from '../offline/db';
import { OfflineStorage } from '../offline/offlineStorage';
import { SyncQueue } from '../offline/syncQueue';
import { notifySyncEvent, subscribeToSync } from './realtime';
import { StorageService } from './storage';
import { generateUUID } from '../utils/uuid';
import { Appointment, AppointmentStatus, AppointmentType, Doctor } from '../types';

// Default seeded doctors in case Supabase or offline DB is empty
export const DEFAULT_DOCTORS: Doctor[] = [
  {
    id: 'd1111111-1111-1111-1111-111111111111',
    name: 'Dr. P. Barua',
    specialization: 'Neurology & Cognitive Health',
    hospital: 'Guwahati Medical College & Hospital (GMCH)',
    phone: '+91 98640 12345',
    consultationType: 'both',
    available: true,
  },
  {
    id: 'd2222222-2222-2222-2222-222222222222',
    name: 'Dr. Arun Sharma',
    specialization: 'Geriatric Medicine',
    hospital: 'Downtown Hospital, Guwahati',
    phone: '+91 94350 23456',
    consultationType: 'both',
    available: true,
  },
  {
    id: 'd3333333-3333-3333-3333-333333333333',
    name: 'Dr. Meena Das',
    specialization: 'Psychiatry & Memory Clinic',
    hospital: 'NEIGRIHMS, Shillong',
    phone: '+91 98560 34567',
    consultationType: 'both',
    available: true,
  },
  {
    id: 'd4444444-4444-4444-4444-444444444444',
    name: 'Dr. Rajesh Roy',
    specialization: 'General Medicine & Elder Care',
    hospital: 'Apollo Clinic, Silchar',
    phone: '+91 94010 45678',
    consultationType: 'in_person',
    available: true,
  },
];

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
    status: (a.status || 'pending') as AppointmentStatus,
    hospital: a.hospital || doctor?.hospital || 'SIROI Health Network',
    meetingLink: a.meeting_link || a.meetingLink,
    cancelledAt: a.cancelled_at || a.cancelledAt,
    completedAt: a.completed_at || a.completedAt,
    createdAt: a.created_at || a.createdAt || new Date().toISOString(),
    updatedAt: a.updated_at || a.updatedAt || new Date().toISOString(),
    syncStatus: (a.sync_status || a.syncStatus || 'synced') as 'synced' | 'pending' | 'failed',
  };
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
          .eq('available', true)
          .order('name', { ascending: true });

        if (!error && data && data.length > 0) {
          const docs: Doctor[] = data.map(mapToDoctor);
          // Save to local cache
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

    // Cache default doctors into IndexedDB for offline resilience
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
   * Retrieve appointments. If patientId is provided, filters for that patient.
   * Checks cloud first if online, falls back to IndexedDB.
   */
  async getAppointments(patientId?: string): Promise<Appointment[]> {
    const doctors = await this.getDoctors();
    const doctorsMap = new Map<string, Doctor>(doctors.map(d => [d.id, d]));

    try {
      if (isSupabaseConfigured() && navigator.onLine) {
        let query = supabase
          .from('appointments')
          .select('*, doctor:doctors(*)')
          .order('appointment_date', { ascending: true })
          .order('appointment_time', { ascending: true });

        if (patientId) {
          query = query.eq('patient_id', patientId);
        }

        const { data, error } = await query;

        if (!error && data) {
          // Cache in Dexie for offline use
          for (const item of data) {
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
          }

          return data.map(item => mapToAppointment(item, doctorsMap));
        }
      }
    } catch (e) {
      console.warn('Cloud appointment fetch warning, falling back to offline cache', e);
    }

    // Offline fallback from IndexedDB
    try {
      const local = await OfflineStorage.getAppointments(patientId);
      return local.map(l => mapToAppointment(l, doctorsMap));
    } catch (e) {
      console.warn('Dexie appointment fetch error', e);
      return [];
    }
  },

  /**
   * Schedule a new appointment.
   * Saves locally, queues for sync if offline, sets up routine reminders, and notifies listeners.
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

    // Build video meeting link if type is video
    const meetingLink = params.appointmentType === 'video'
      ? `https://meet.jit.si/SIROI-${id.substring(0, 8)}`
      : undefined;

    const localItem: LocalAppointment = {
      id,
      patient_id: params.patientId,
      patient_name: params.patientName,
      caregiver_id: params.caregiverId,
      caregiver_name: params.caregiverName,
      doctor_id: params.doctorId,
      doctor_name: params.doctorName,
      specialization: params.specialization,
      appointment_date: params.appointmentDate,
      appointment_time: params.appointmentTime,
      appointment_type: params.appointmentType,
      reason: params.reason,
      notes: params.notes,
      status: 'confirmed', // Confirmed within SIROI platform
      hospital: params.hospital,
      meeting_link: meetingLink,
      created_at: now,
      updated_at: now,
      sync_status: isOnline && isSupabaseConfigured() ? 'synced' : 'pending',
    };

    // 1. Save to local Dexie storage
    await OfflineStorage.saveAppointment(localItem);

    // 2. Schedule reminders (24h and 1h reminders) via StorageService
    try {
      this.scheduleAppointmentReminders(localItem);
    } catch (err) {
      console.warn('Error scheduling appointment reminders', err);
    }

    // 3. Sync to Supabase if connected
    if (isOnline && isSupabaseConfigured()) {
      try {
        const payload = {
          id: localItem.id,
          patient_id: localItem.patient_id,
          caregiver_id: localItem.caregiver_id,
          doctor_id: localItem.doctor_id,
          appointment_date: localItem.appointment_date,
          appointment_time: localItem.appointment_time.includes(':') && localItem.appointment_time.length <= 5
            ? `${localItem.appointment_time}:00`
            : localItem.appointment_time,
          appointment_type: localItem.appointment_type,
          reason: localItem.reason || null,
          notes: localItem.notes || null,
          status: localItem.status,
          hospital: localItem.hospital || null,
          meeting_link: localItem.meeting_link || null,
          created_at: localItem.created_at,
          updated_at: localItem.updated_at,
        };

        const { error } = await supabase.from('appointments').upsert(payload, { onConflict: 'id' });
        if (error) {
          console.warn('Supabase appointment insert error, queuing sync', error);
          await SyncQueue.enqueue('INSERT', 'appointments', id, payload);
          await db.appointments.update(id, { sync_status: 'pending' });
        }
      } catch (err) {
        console.warn('Network error creating appointment, queuing sync', err);
        await SyncQueue.enqueue('INSERT', 'appointments', id, localItem);
        await db.appointments.update(id, { sync_status: 'pending' });
      }
    } else {
      // Offline: Enqueue for sync when back online
      await SyncQueue.enqueue('INSERT', 'appointments', id, localItem);
    }

    // 4. Notify realtime listeners across tabs/devices
    const result = mapToAppointment(localItem);
    notifySyncEvent('mindcare_appointments', result, 'APPOINTMENT_CHANGED');

    return result;
  },

  /**
   * Reschedule an existing appointment.
   */
  async rescheduleAppointment(
    appointmentId: string,
    newDate: string,
    newTime: string,
    notes?: string
  ): Promise<Appointment> {
    const existing = await OfflineStorage.getAppointmentById(appointmentId);
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
      sync_status: isOnline && isSupabaseConfigured() ? 'synced' : 'pending',
    };

    // 1. Update local storage
    await OfflineStorage.saveAppointment({
      ...(existing || ({} as any)),
      ...updatedData,
      id: appointmentId,
    });

    // 2. Reschedule reminders
    if (existing) {
      this.scheduleAppointmentReminders({
        ...existing,
        ...updatedData,
      });
    }

    // 3. Sync to Supabase
    if (isOnline && isSupabaseConfigured()) {
      try {
        const timeFormatted = newTime.includes(':') && newTime.length <= 5 ? `${newTime}:00` : newTime;
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

        if (error) {
          console.warn('Cloud reschedule error, queuing sync', error);
          await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatedData);
          await db.appointments.update(appointmentId, { sync_status: 'pending' });
        }
      } catch (e) {
        console.warn('Network error during reschedule, queuing sync', e);
        await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatedData);
        await db.appointments.update(appointmentId, { sync_status: 'pending' });
      }
    } else {
      await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatedData);
    }

    // 4. Notify realtime listeners
    const updatedFull = await OfflineStorage.getAppointmentById(appointmentId);
    const result = mapToAppointment(updatedFull || { id: appointmentId, ...updatedData });
    notifySyncEvent('mindcare_appointments', result, 'APPOINTMENT_CHANGED');

    return result;
  },

  /**
   * Cancel an appointment. NEVER deletes the row from the database (maintains audit trail).
   */
  async cancelAppointment(appointmentId: string, reason?: string): Promise<Appointment> {
    const existing = await OfflineStorage.getAppointmentById(appointmentId);
    const now = new Date().toISOString();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    const cancelNotes = reason
      ? (existing?.notes ? `${existing.notes}\n[Cancelled: ${reason}]` : `Cancelled: ${reason}`)
      : existing?.notes;

    const updatePayload: Partial<LocalAppointment> = {
      status: 'cancelled',
      notes: cancelNotes,
      cancelled_at: now,
      updated_at: now,
      sync_status: isOnline && isSupabaseConfigured() ? 'synced' : 'pending',
    };

    // 1. Update local storage
    await OfflineStorage.updateAppointmentStatus(appointmentId, 'cancelled');
    if (existing) {
      await OfflineStorage.saveAppointment({
        ...existing,
        ...updatePayload,
      });
    }

    // 2. Remove / clean up reminders
    if (existing?.patient_id) {
      this.cleanupAppointmentReminders(appointmentId, existing.patient_id);
    }

    // 3. Sync to Supabase
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

        if (error) {
          console.warn('Cloud cancellation error, queuing sync', error);
          await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatePayload);
          await db.appointments.update(appointmentId, { sync_status: 'pending' });
        }
      } catch (e) {
        console.warn('Network error cancelling appointment, queuing sync', e);
        await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatePayload);
        await db.appointments.update(appointmentId, { sync_status: 'pending' });
      }
    } else {
      await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatePayload);
    }

    // 4. Notify realtime listeners
    const updatedFull = await OfflineStorage.getAppointmentById(appointmentId);
    const result = mapToAppointment(updatedFull || { id: appointmentId, ...updatePayload });
    notifySyncEvent('mindcare_appointments', result, 'APPOINTMENT_CHANGED');

    return result;
  },

  /**
   * Mark appointment as completed.
   */
  async completeAppointment(appointmentId: string): Promise<Appointment> {
    const existing = await OfflineStorage.getAppointmentById(appointmentId);
    const now = new Date().toISOString();
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    const updatePayload: Partial<LocalAppointment> = {
      status: 'completed',
      completed_at: now,
      updated_at: now,
      sync_status: isOnline && isSupabaseConfigured() ? 'synced' : 'pending',
    };

    await OfflineStorage.updateAppointmentStatus(appointmentId, 'completed');
    if (existing) {
      await OfflineStorage.saveAppointment({
        ...existing,
        ...updatePayload,
      });
    }

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
        await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatePayload);
      }
    } else {
      await SyncQueue.enqueue('UPDATE', 'appointments', appointmentId, updatePayload);
    }

    const updatedFull = await OfflineStorage.getAppointmentById(appointmentId);
    const result = mapToAppointment(updatedFull || { id: appointmentId, ...updatePayload });
    notifySyncEvent('mindcare_appointments', result, 'APPOINTMENT_CHANGED');

    return result;
  },

  /**
   * Automatically schedule reminders for this appointment in StorageService under category 'visit'.
   * Creates 24-hour and 1-hour reminders.
   */
  scheduleAppointmentReminders(app: Partial<LocalAppointment>): void {
    if (!app.patient_id || !app.appointment_date || !app.appointment_time) return;

    const docName = app.doctor_name || 'Doctor';
    const spec = app.specialization ? ` (${app.specialization})` : '';
    const dateStr = app.appointment_date;
    const timeStr = app.appointment_time;
    const typeLabel = app.appointment_type === 'video' ? 'Video Consultation' : 'In-Person Visit';

    // 1. Routine reminder for day of visit
    StorageService.addReminder({
      id: `rem-appt-day-${app.id}`,
      title: `Doctor Visit Today: ${docName}${spec}`,
      time: timeStr,
      category: 'visit',
      repeat: 'once',
      description: `${typeLabel} scheduled at ${timeStr} with ${docName}. Reason: ${app.reason || 'Routine evaluation'}`,
      isCompleted: false,
    }, app.patient_id);

    // 2. Day before reminder
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
   * Cleanup scheduled reminders when an appointment is cancelled.
   */
  cleanupAppointmentReminders(appointmentId: string, patientId: string): void {
    try {
      StorageService.deleteReminder(`rem-appt-day-${appointmentId}`, patientId);
      StorageService.deleteReminder(`rem-appt-pre-${appointmentId}`, patientId);
    } catch (_) {}
  },

  /**
   * Listen for appointment updates across tabs and devices.
   */
  subscribe(callback: () => void): () => void {
    return subscribeToSync((payload) => {
      if (payload.key === 'mindcare_appointments' || payload.type === 'APPOINTMENT_CHANGED') {
        callback();
      }
    });
  },
};
