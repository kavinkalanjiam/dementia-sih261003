import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { StorageService } from '../services/storage';
import { CareTeamService } from '../services/careTeamService';
import { AppointmentService } from '../services/appointmentService';
import { Appointment, AppointmentStatus, AppointmentType, Doctor, PatientProfile } from '../types';
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  Video,
  MapPin,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  WifiOff,
  Search,
  Filter,
  Info,
  CalendarDays,
} from 'lucide-react';

interface AppointmentsPageProps {
  onNavigate: (page: string) => void;
}

export const AppointmentsPage: React.FC<AppointmentsPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { t } = useI18n();

  // Active patient and authorized patient list
  const [patient, setPatient] = useState<PatientProfile>(() => StorageService.getPatientProfile(undefined, user?.id));
  const caregiverPatientIds = user?.id ? CareTeamService.getPatientsForCaregiver(user.id) : [];
  const allPatients = StorageService.getAllPatientProfiles();
  const availablePatients = allPatients.filter(p => caregiverPatientIds.includes(p.id) || p.id === patient?.id);

  // Doctors and Appointments state
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Tabs and search filter
  const [activeTab, setActiveTab] = useState<'upcoming' | 'today' | 'completed' | 'cancelled' | 'all'>('upcoming');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [showBookModal, setShowBookModal] = useState<boolean>(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState<boolean>(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState<boolean>(false);
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);

  // Form states for booking
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patient?.id || '');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [appointmentDate, setAppointmentDate] = useState<string>('');
  const [appointmentTime, setAppointmentTime] = useState<string>('10:00 AM');
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('in_person');
  const [appointmentReason, setAppointmentReason] = useState<string>('Memory & Cognitive Evaluation');
  const [appointmentNotes, setAppointmentNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  // Form states for rescheduling
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleTime, setRescheduleTime] = useState<string>('10:00 AM');
  const [rescheduleNotes, setRescheduleNotes] = useState<string>('');

  // Form states for cancellation
  const [cancelReason, setCancelReason] = useState<string>('');

  // Today's date in YYYY-MM-DD format
  const todayIso = new Date().toISOString().split('T')[0];

  // Quick time slots
  const TIME_SLOTS = [
    '09:00 AM',
    '10:00 AM',
    '11:30 AM',
    '02:00 PM',
    '03:30 PM',
    '04:30 PM',
    '05:00 PM',
  ];

  // Quick reason suggestions
  const REASON_PRESETS = [
    'Memory & Cognitive Evaluation',
    'Routine Neurological Follow-up',
    'Medication Review & Adjustments',
    'Geriatric Wellness Assessment',
    'General Health Checkup',
  ];

  // Load doctors & appointments
  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedDocs, fetchedAppts] = await Promise.all([
        AppointmentService.getDoctors(),
        AppointmentService.getAppointments(patient?.id),
      ]);
      setDoctors(fetchedDocs);
      setAppointments(fetchedAppts);
      if (fetchedDocs.length > 0 && !selectedDoctorId) {
        setSelectedDoctorId(fetchedDocs[0].id);
      }
    } catch (err) {
      console.warn('Error loading appointment data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to realtime changes across tabs and devices
    const unsubscribe = AppointmentService.subscribe(() => {
      AppointmentService.getAppointments(patient?.id).then(setAppointments);
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [patient?.id]);

  // Handle switching active patient
  const handleSwitchPatient = (targetId: string) => {
    const selected = StorageService.getPatientProfile(targetId, user?.id);
    setPatient(selected);
    setSelectedPatientId(selected.id);
    StorageService.setActivePatientId(selected.id, user?.id);
  };

  // Helper to categorize appointments
  const filteredAppointments = appointments.filter((app) => {
    // Search query filter
    const matchesSearch =
      searchQuery === '' ||
      app.doctor?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.doctor?.specialization.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.reason && app.reason.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (app.hospital && app.hospital.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    // Tab filter
    if (activeTab === 'all') return true;
    if (activeTab === 'cancelled') return app.status === 'cancelled';
    if (activeTab === 'completed') return app.status === 'completed';

    if (activeTab === 'today') {
      return (
        app.appointmentDate === todayIso &&
        app.status !== 'cancelled' &&
        app.status !== 'completed'
      );
    }

    if (activeTab === 'upcoming') {
      return (
        app.appointmentDate >= todayIso &&
        app.status !== 'cancelled' &&
        app.status !== 'completed'
      );
    }

    return true;
  });

  // Calculate counts for badges
  const upcomingCount = appointments.filter(
    (a) => a.appointmentDate >= todayIso && a.status !== 'cancelled' && a.status !== 'completed'
  ).length;
  const todayCount = appointments.filter(
    (a) => a.appointmentDate === todayIso && a.status !== 'cancelled' && a.status !== 'completed'
  ).length;
  const completedCount = appointments.filter((a) => a.status === 'completed').length;
  const cancelledCount = appointments.filter((a) => a.status === 'cancelled').length;

  // Handle booking submission
  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!selectedPatientId) {
      setFormError('Please select a patient.');
      return;
    }
    if (!selectedDoctorId) {
      setFormError('Please select a doctor.');
      return;
    }
    if (!appointmentDate) {
      setFormError('Please choose a valid appointment date.');
      return;
    }
    if (appointmentDate < todayIso) {
      setFormError('Appointment date cannot be in the past.');
      return;
    }
    if (!appointmentTime) {
      setFormError('Please select or specify an appointment time.');
      return;
    }

    const doc = doctors.find((d) => d.id === selectedDoctorId);
    if (!doc) {
      setFormError('Selected doctor is not available.');
      return;
    }

    const patientObj = availablePatients.find((p) => p.id === selectedPatientId) || patient;

    setSubmitting(true);
    try {
      await AppointmentService.createAppointment({
        patientId: selectedPatientId,
        patientName: patientObj?.basicInfo?.name || 'Patient',
        caregiverId: user?.id || 'caregiver-local',
        caregiverName: user?.email || 'Primary Caregiver',
        doctorId: doc.id,
        doctorName: doc.name,
        specialization: doc.specialization,
        hospital: doc.hospital,
        appointmentDate,
        appointmentTime,
        appointmentType,
        reason: appointmentReason,
        notes: appointmentNotes,
      });

      setShowBookModal(false);
      // Reset form
      setAppointmentDate('');
      setAppointmentNotes('');
      // Reload appointments
      const updated = await AppointmentService.getAppointments(patient?.id);
      setAppointments(updated);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to book appointment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle reschedule submission
  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) return;

    if (!rescheduleDate || rescheduleDate < todayIso) {
      alert('Please choose a valid future date for rescheduling.');
      return;
    }

    setSubmitting(true);
    try {
      await AppointmentService.rescheduleAppointment(
        selectedAppointment.id,
        rescheduleDate,
        rescheduleTime,
        rescheduleNotes
      );
      setShowRescheduleModal(false);
      setSelectedAppointment(null);
      const updated = await AppointmentService.getAppointments(patient?.id);
      setAppointments(updated);
    } catch (err: any) {
      alert('Error rescheduling appointment: ' + err?.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle cancellation submission
  const handleCancel = async () => {
    if (!selectedAppointment) return;

    setSubmitting(true);
    try {
      await AppointmentService.cancelAppointment(selectedAppointment.id, cancelReason);
      setShowCancelModal(false);
      setSelectedAppointment(null);
      setCancelReason('');
      const updated = await AppointmentService.getAppointments(patient?.id);
      setAppointments(updated);
    } catch (err: any) {
      alert('Error cancelling appointment: ' + err?.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle completion
  const handleMarkCompleted = async (appt: Appointment) => {
    try {
      await AppointmentService.completeAppointment(appt.id);
      const updated = await AppointmentService.getAppointments(patient?.id);
      setAppointments(updated);
    } catch (err: any) {
      alert('Error marking as completed: ' + err?.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 text-[#26332F]">
      {/* ── 1. MEDICAL SAFETY & PROTOTYPE BANNER ──────────────── */}
      <div className="bg-[#FAF9F4] border-2 border-[#176B61]/20 rounded-2xl p-4 shadow-sm flex items-start sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#DDE9D9] text-[#176B61] flex items-center justify-center shrink-0">
            <Info className="w-5 h-5 text-[#176B61]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase font-extrabold tracking-wider bg-[#DDE9D9] text-[#176B61] px-2.5 py-0.5 rounded-md">
                Prototype Decision Support
              </span>
              <span className="text-xs text-[#66736D] font-medium">
                Internal Routine & Reminder Management
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#26332F] mt-1">
              <strong>SIROI Appointment Booking:</strong> Records doctor visits to coordinate family care and automatically generate routine reminder checkpoints for the patient. External hospital booking systems are not connected.
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. OFFLINE STATUS BANNER (CONDITIONAL) ────────────── */}
      {!isOnline && (
        <div className="bg-[#F4EBD7] border border-[#E4DED4] rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm text-[#26332F] font-semibold">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-[#176B61]" />
            <span>
              <strong>Offline Mode:</strong> Appointments booked or updated locally will automatically sync with Supabase when your connection is restored.
            </span>
          </div>
          <span className="px-2 py-0.5 bg-white rounded-md text-[11px] uppercase tracking-wider font-bold text-[#176B61] border border-[#E4DED4]">
            Local Cache Active
          </span>
        </div>
      )}

      {/* ── 3. HEADER & CONTROLS ─────────────────────────────── */}
      <div className="bg-[#FAF9F4] text-[#26332F] rounded-3xl p-6 sm:p-8 shadow-sm border border-[#E4DED4] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="bg-[#DDE9D9] text-[#176B61] text-xs uppercase font-extrabold tracking-wider px-3 py-1 rounded-full border border-[#BFCFC5]">
              Doctor Consultations
            </span>

            {/* Patient Switcher */}
            {availablePatients.length > 1 ? (
              <select
                value={patient?.id}
                onChange={(e) => handleSwitchPatient(e.target.value)}
                className="bg-white border border-[#E4DED4] text-[#26332F] text-xs font-bold rounded-full px-3 py-1 outline-none cursor-pointer"
              >
                {availablePatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    Patient: {p.basicInfo.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="bg-[#DDE9D9] text-[#176B61] text-xs font-bold px-3 py-1 rounded-full border border-[#BFCFC5]">
                Patient: {patient?.basicInfo?.name || 'Selected Patient'}
              </span>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#26332F]">
            Doctor Appointments
          </h1>
          <p className="text-sm text-[#66736D] mt-1">
            Schedule visits, track memory clinics, and automate reminder checkpoints for{' '}
            <strong>{patient?.basicInfo?.name}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              setSelectedPatientId(patient?.id || '');
              if (doctors.length > 0 && !selectedDoctorId) {
                setSelectedDoctorId(doctors[0].id);
              }
              setAppointmentDate('');
              setFormError('');
              setShowBookModal(true);
            }}
            className="px-5 py-2.5 bg-[#176B61] hover:bg-[#12564E] text-white font-extrabold text-sm rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Book Doctor Appointment
          </button>
          <button
            onClick={loadData}
            title="Refresh Appointments"
            className="p-2.5 bg-white hover:bg-[#FAF9F4] text-[#26332F] font-bold rounded-xl border border-[#E4DED4] transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#176B61]' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── 4. NAVIGATION TABS & SEARCH ──────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-[#FAF9F4] border border-[#E4DED4] rounded-2xl overflow-x-auto">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'upcoming'
                ? 'bg-[#176B61] text-white shadow-xs'
                : 'text-[#66736D] hover:text-[#26332F]'
            }`}
          >
            <span>Upcoming</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeTab === 'upcoming'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#DDE9D9] text-[#176B61]'
              }`}
            >
              {upcomingCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('today')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'today'
                ? 'bg-[#176B61] text-white shadow-xs'
                : 'text-[#66736D] hover:text-[#26332F]'
            }`}
          >
            <span>Today</span>
            {todayCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  activeTab === 'today'
                    ? 'bg-white/20 text-white'
                    : 'bg-[#176B61] text-white'
                }`}
              >
                {todayCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('completed')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'completed'
                ? 'bg-[#176B61] text-white shadow-xs'
                : 'text-[#66736D] hover:text-[#26332F]'
            }`}
          >
            <span>Completed</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeTab === 'completed'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#E4DED4] text-[#26332F]'
              }`}
            >
              {completedCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('cancelled')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'cancelled'
                ? 'bg-[#176B61] text-white shadow-xs'
                : 'text-[#66736D] hover:text-[#26332F]'
            }`}
          >
            <span>Cancelled</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeTab === 'cancelled'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#EFD4D3] text-[#A56F72]'
              }`}
            >
              {cancelledCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'all'
                ? 'bg-[#176B61] text-white shadow-xs'
                : 'text-[#66736D] hover:text-[#26332F]'
            }`}
          >
            <span>All ({appointments.length})</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#66736D] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search doctor, hospital..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#FAF9F4] border border-[#E4DED4] rounded-2xl pl-10 pr-4 py-2 text-xs font-semibold text-[#26332F] outline-none focus:border-[#176B61]"
          />
        </div>
      </div>

      {/* ── 5. APPOINTMENTS LIST / GRID ──────────────────────── */}
      {loading ? (
        <div className="bg-[#FAF9F4] rounded-3xl p-12 text-center border border-[#E4DED4] flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-[#176B61] animate-spin" />
          <p className="text-sm font-semibold text-[#66736D]">Loading appointments and doctors...</p>
        </div>
      ) : filteredAppointments.length === 0 ? (
        <div className="bg-[#FAF9F4] rounded-3xl p-12 text-center border border-[#E4DED4] space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#DDE9D9] text-[#176B61] flex items-center justify-center">
            <CalendarDays className="w-7 h-7 text-[#176B61]" />
          </div>
          <h3 className="text-lg font-extrabold text-[#26332F]">
            {searchQuery ? 'No matching appointments found' : 'No appointments in this view'}
          </h3>
          <p className="text-xs sm:text-sm text-[#66736D] max-w-md mx-auto">
            {searchQuery
              ? 'Try refining your search terms or selecting a different tab.'
              : 'Schedule an upcoming consultation, memory clinic evaluation, or regular follow-up with a regional doctor.'}
          </p>
          <button
            onClick={() => {
              setSelectedPatientId(patient?.id || '');
              setShowBookModal(true);
            }}
            className="px-4 py-2 bg-[#176B61] hover:bg-[#12564E] text-white font-extrabold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            + Book First Appointment
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAppointments.map((appt) => {
            const isToday = appt.appointmentDate === todayIso;
            const isUpcoming = appt.appointmentDate > todayIso && appt.status !== 'cancelled' && appt.status !== 'completed';
            const isCancelled = appt.status === 'cancelled';
            const isCompleted = appt.status === 'completed';

            return (
              <div
                key={appt.id}
                className={`bg-[#FAF9F4] rounded-3xl p-5 border transition flex flex-col justify-between space-y-4 shadow-xs hover:shadow-md ${
                  isToday
                    ? 'border-2 border-[#176B61]'
                    : isCancelled
                    ? 'border-[#EFD4D3] opacity-75'
                    : 'border-[#E4DED4]'
                }`}
              >
                {/* Card Header: Type Badge & Status */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                        appt.appointmentType === 'video'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-[#DDE9D9] text-[#176B61] border border-[#BFCFC5]'
                      }`}
                    >
                      {appt.appointmentType === 'video' ? (
                        <>
                          <Video className="w-3 h-3" /> Teleconsultation
                        </>
                      ) : (
                        <>
                          <Stethoscope className="w-3 h-3" /> In-Person Visit
                        </>
                      )}
                    </span>

                    <span
                      className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full ${
                        isToday
                          ? 'bg-[#176B61] text-white'
                          : isCancelled
                          ? 'bg-[#EFD4D3] text-[#A56F72]'
                          : isCompleted
                          ? 'bg-gray-200 text-gray-700'
                          : appt.status === 'rescheduled'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-[#DDE9D9] text-[#176B61]'
                      }`}
                    >
                      {isToday ? 'Today' : appt.status}
                    </span>
                  </div>

                  {/* Doctor Info */}
                  <h3 className="text-lg font-black text-[#26332F]">
                    {appt.doctor?.name || 'Dr. Medical Specialist'}
                  </h3>
                  <p className="text-xs font-bold text-[#176B61]">
                    {appt.doctor?.specialization || 'General Medicine'}
                  </p>
                  <p className="text-xs text-[#66736D] mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0 text-[#66736D]" />
                    <span className="truncate">{appt.hospital || appt.doctor?.hospital || 'SIROI Health Network'}</span>
                  </p>
                </div>

                {/* Date, Time & Reason */}
                <div className="bg-white rounded-2xl p-3 border border-[#E4DED4] space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#26332F]">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#176B61]" />
                      <span>{appt.appointmentDate}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#176B61]" />
                      <span>{appt.appointmentTime}</span>
                    </div>
                  </div>

                  {appt.reason && (
                    <div className="text-xs text-[#66736D] border-t border-[#E4DED4] pt-2">
                      <span className="font-bold text-[#26332F]">Reason: </span>
                      <span className="line-clamp-2">{appt.reason}</span>
                    </div>
                  )}

                  {appt.meetingLink && appt.appointmentType === 'video' && !isCancelled && (
                    <a
                      href={appt.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                    >
                      <Video className="w-3.5 h-3.5" /> Join Video Call
                    </a>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between gap-2 border-t border-[#E4DED4] pt-3">
                  <button
                    onClick={() => {
                      setSelectedAppointment(appt);
                      setShowDetailsModal(true);
                    }}
                    className="text-xs font-extrabold text-[#176B61] hover:text-[#12564E] transition flex items-center gap-1 cursor-pointer"
                  >
                    Details <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    {!isCancelled && !isCompleted && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedAppointment(appt);
                            setRescheduleDate(appt.appointmentDate);
                            setRescheduleTime(appt.appointmentTime);
                            setRescheduleNotes('');
                            setShowRescheduleModal(true);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-[#FAF9F4] text-[#26332F] text-xs font-bold rounded-lg border border-[#E4DED4] transition cursor-pointer"
                        >
                          Reschedule
                        </button>
                        <button
                          onClick={() => handleMarkCompleted(appt)}
                          title="Mark Completed"
                          className="p-1 bg-[#DDE9D9] hover:bg-[#c5dbbf] text-[#176B61] rounded-lg transition cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAppointment(appt);
                            setCancelReason('');
                            setShowCancelModal(true);
                          }}
                          title="Cancel Appointment"
                          className="p-1 bg-[#EFD4D3] hover:bg-[#e4bebd] text-[#A56F72] rounded-lg transition cursor-pointer"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {isCancelled && (
                      <span className="text-[11px] text-[#A56F72] font-semibold italic">
                        Cancelled (Record Kept)
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-[11px] text-gray-500 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Completed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 6. BOOK APPOINTMENT MODAL ─────────────────────────── */}
      {showBookModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#FAF9F4] rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-[#E4DED4] shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-[#E4DED4] pb-4">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#176B61] bg-[#DDE9D9] px-2.5 py-0.5 rounded-full">
                  SIROI Care Coordinator
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-[#26332F] mt-1">
                  Book Doctor Appointment
                </h2>
              </div>
              <button
                onClick={() => setShowBookModal(false)}
                className="w-8 h-8 rounded-full bg-white text-[#66736D] hover:text-[#26332F] border border-[#E4DED4] flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-[#EFD4D3] border border-[#A56F72] rounded-xl text-xs font-bold text-[#A56F72] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleBookAppointment} className="space-y-4">
              {/* Patient Selector */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#26332F] mb-1">
                  Select Patient
                </label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full bg-white border border-[#E4DED4] rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#26332F] outline-none focus:border-[#176B61]"
                >
                  {availablePatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.basicInfo.name} ({p.basicInfo.age} yrs)
                    </option>
                  ))}
                </select>
              </div>

              {/* Doctor Selector */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#26332F] mb-1">
                  Select Doctor / Specialist
                </label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full bg-white border border-[#E4DED4] rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#26332F] outline-none focus:border-[#176B61]"
                >
                  {doctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name} — {doc.specialization} ({doc.hospital})
                    </option>
                  ))}
                </select>
              </div>

              {/* Appointment Type */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#26332F] mb-1.5">
                  Consultation Mode
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAppointmentType('in_person')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      appointmentType === 'in_person'
                        ? 'bg-[#176B61] text-white border-[#176B61]'
                        : 'bg-white text-[#26332F] border-[#E4DED4] hover:bg-[#FAF9F4]'
                    }`}
                  >
                    <Stethoscope className="w-4 h-4" /> In-Person Visit
                  </button>
                  <button
                    type="button"
                    onClick={() => setAppointmentType('video')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      appointmentType === 'video'
                        ? 'bg-[#176B61] text-white border-[#176B61]'
                        : 'bg-white text-[#26332F] border-[#E4DED4] hover:bg-[#FAF9F4]'
                    }`}
                  >
                    <Video className="w-4 h-4" /> Video Call (Telehealth)
                  </button>
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-[#26332F] mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    min={todayIso}
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    required
                    className="w-full bg-white border border-[#E4DED4] rounded-xl px-3.5 py-2 text-xs font-bold text-[#26332F] outline-none focus:border-[#176B61]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-[#26332F] mb-1">
                    Time
                  </label>
                  <input
                    type="text"
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    placeholder="e.g. 10:00 AM"
                    required
                    className="w-full bg-white border border-[#E4DED4] rounded-xl px-3.5 py-2 text-xs font-bold text-[#26332F] outline-none focus:border-[#176B61]"
                  />
                </div>
              </div>

              {/* Quick Time Chips */}
              <div>
                <span className="text-[11px] font-semibold text-[#66736D]">Suggested Slots:</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {TIME_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setAppointmentTime(slot)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                        appointmentTime === slot
                          ? 'bg-[#176B61] text-white border-[#176B61]'
                          : 'bg-white text-[#26332F] border-[#E4DED4] hover:bg-[#FAF9F4]'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#26332F] mb-1">
                  Reason for Consultation
                </label>
                <input
                  type="text"
                  value={appointmentReason}
                  onChange={(e) => setAppointmentReason(e.target.value)}
                  placeholder="e.g. Memory check, medication follow-up"
                  className="w-full bg-white border border-[#E4DED4] rounded-xl px-3.5 py-2 text-xs font-bold text-[#26332F] outline-none focus:border-[#176B61]"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {REASON_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAppointmentReason(preset)}
                      className="text-[10px] bg-white border border-[#E4DED4] text-[#66736D] hover:text-[#176B61] px-2 py-0.5 rounded-md font-medium cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#26332F] mb-1">
                  Caregiver Notes / Questions for Doctor (Optional)
                </label>
                <textarea
                  rows={2}
                  value={appointmentNotes}
                  onChange={(e) => setAppointmentNotes(e.target.value)}
                  placeholder="Symptoms observed, questions about medications..."
                  className="w-full bg-white border border-[#E4DED4] rounded-xl px-3.5 py-2 text-xs text-[#26332F] outline-none focus:border-[#176B61]"
                />
              </div>

              {/* Safety notice disclaimer */}
              <div className="p-3 bg-[#FAF9F4] border border-[#E4DED4] rounded-xl text-[11px] text-[#66736D] space-y-1">
                <p>
                  🔔 <strong>Automatic Reminders:</strong> Booking this appointment automatically creates 24-hour and 1-hour routine reminders on the patient's schedule.
                </p>
                <p>
                  ⚠️ <em>Note: SIROI stores this schedule for patient care. Please verify directly with the clinic if required.</em>
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBookModal(false)}
                  className="px-4 py-2 bg-white hover:bg-[#FAF9F4] text-[#26332F] text-xs font-bold rounded-xl border border-[#E4DED4] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#176B61] hover:bg-[#12564E] text-white text-xs font-extrabold rounded-xl transition shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Confirming...' : 'Confirm Appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 7. RESCHEDULE MODAL ──────────────────────────────── */}
      {showRescheduleModal && selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF9F4] rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#E4DED4] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E4DED4] pb-3">
              <h2 className="text-xl font-black text-[#26332F]">Reschedule Appointment</h2>
              <button
                onClick={() => setShowRescheduleModal(false)}
                className="w-8 h-8 rounded-full bg-white text-[#66736D] border border-[#E4DED4] flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#66736D]">
              Rescheduling appointment with{' '}
              <strong>{selectedAppointment.doctor?.name || 'the doctor'}</strong> for{' '}
              <strong>{selectedAppointment.patientName || patient?.basicInfo?.name}</strong>.
            </p>

            <form onSubmit={handleReschedule} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#26332F] mb-1">
                  New Date
                </label>
                <input
                  type="date"
                  min={todayIso}
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  required
                  className="w-full bg-white border border-[#E4DED4] rounded-xl px-3.5 py-2 text-xs font-bold text-[#26332F] outline-none focus:border-[#176B61]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#26332F] mb-1">
                  New Time
                </label>
                <input
                  type="text"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  required
                  className="w-full bg-white border border-[#E4DED4] rounded-xl px-3.5 py-2 text-xs font-bold text-[#26332F] outline-none focus:border-[#176B61]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#26332F] mb-1">
                  Reason for Rescheduling (Optional)
                </label>
                <textarea
                  rows={2}
                  value={rescheduleNotes}
                  onChange={(e) => setRescheduleNotes(e.target.value)}
                  placeholder="e.g. Conflict with family event..."
                  className="w-full bg-white border border-[#E4DED4] rounded-xl px-3.5 py-2 text-xs text-[#26332F] outline-none focus:border-[#176B61]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRescheduleModal(false)}
                  className="px-4 py-2 bg-white text-[#26332F] text-xs font-bold rounded-xl border border-[#E4DED4] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#176B61] text-white text-xs font-extrabold rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 8. CANCEL APPOINTMENT MODAL ───────────────────────── */}
      {showCancelModal && selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF9F4] rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#E4DED4] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E4DED4] pb-3">
              <h2 className="text-xl font-black text-[#A56F72]">Cancel Appointment</h2>
              <button
                onClick={() => setShowCancelModal(false)}
                className="w-8 h-8 rounded-full bg-white text-[#66736D] border border-[#E4DED4] flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#26332F]">
              Are you sure you want to cancel the appointment with{' '}
              <strong>{selectedAppointment.doctor?.name}</strong> on{' '}
              <strong>{selectedAppointment.appointmentDate}</strong>?
            </p>

            <div className="p-3 bg-[#EFD4D3]/40 border border-[#A56F72]/30 rounded-xl text-xs text-[#26332F] space-y-1">
              <p>
                <strong>Audit Record Preserved:</strong> This appointment will remain marked as{' '}
                <em>Cancelled</em> in your records and will not be permanently deleted.
              </p>
              <p className="text-[11px] text-[#66736D]">
                Associated routine reminder alerts will also be cleaned up.
              </p>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-[#26332F] mb-1">
                Reason for Cancellation (Optional)
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Patient feeling unwell, rescheduled outside app..."
                className="w-full bg-white border border-[#E4DED4] rounded-xl px-3.5 py-2 text-xs text-[#26332F] outline-none focus:border-[#176B61]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 bg-white text-[#26332F] text-xs font-bold rounded-xl border border-[#E4DED4] cursor-pointer"
              >
                Keep Appointment
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                className="px-5 py-2 bg-[#A56F72] hover:bg-[#8e5c5f] text-white text-xs font-extrabold rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 9. APPOINTMENT DETAILS MODAL ──────────────────────── */}
      {showDetailsModal && selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF9F4] rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-[#E4DED4] shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#E4DED4] pb-3">
              <div>
                <span className="text-[10px] uppercase font-extrabold tracking-wider bg-[#DDE9D9] text-[#176B61] px-2.5 py-0.5 rounded-full">
                  Appointment Details
                </span>
                <h2 className="text-xl font-black text-[#26332F] mt-1">
                  {selectedAppointment.doctor?.name || 'Dr. Medical Specialist'}
                </h2>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="w-8 h-8 rounded-full bg-white text-[#66736D] border border-[#E4DED4] flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-white p-3.5 rounded-2xl border border-[#E4DED4]">
                <div>
                  <span className="text-[#66736D] font-bold block">Specialization:</span>
                  <span className="text-[#26332F] font-extrabold">
                    {selectedAppointment.doctor?.specialization || 'General Health'}
                  </span>
                </div>
                <div>
                  <span className="text-[#66736D] font-bold block">Patient:</span>
                  <span className="text-[#26332F] font-extrabold">
                    {selectedAppointment.patientName || patient?.basicInfo?.name}
                  </span>
                </div>
                <div>
                  <span className="text-[#66736D] font-bold block">Date:</span>
                  <span className="text-[#26332F] font-extrabold">
                    {selectedAppointment.appointmentDate}
                  </span>
                </div>
                <div>
                  <span className="text-[#66736D] font-bold block">Time:</span>
                  <span className="text-[#26332F] font-extrabold">
                    {selectedAppointment.appointmentTime}
                  </span>
                </div>
                <div>
                  <span className="text-[#66736D] font-bold block">Hospital / Location:</span>
                  <span className="text-[#26332F] font-extrabold">
                    {selectedAppointment.hospital || selectedAppointment.doctor?.hospital || 'SIROI Health Network'}
                  </span>
                </div>
                <div>
                  <span className="text-[#66736D] font-bold block">Status:</span>
                  <span className="text-[#176B61] font-black uppercase">
                    {selectedAppointment.status}
                  </span>
                </div>
              </div>

              {selectedAppointment.reason && (
                <div className="bg-white p-3.5 rounded-2xl border border-[#E4DED4]">
                  <span className="text-[#66736D] font-bold block mb-0.5">Reason for Visit:</span>
                  <span className="text-[#26332F]">{selectedAppointment.reason}</span>
                </div>
              )}

              {selectedAppointment.notes && (
                <div className="bg-white p-3.5 rounded-2xl border border-[#E4DED4]">
                  <span className="text-[#66736D] font-bold block mb-0.5">Caregiver Notes:</span>
                  <span className="text-[#26332F] whitespace-pre-line">
                    {selectedAppointment.notes}
                  </span>
                </div>
              )}

              {selectedAppointment.meetingLink && (
                <div className="bg-blue-50 p-3.5 rounded-2xl border border-blue-200 flex items-center justify-between">
                  <div>
                    <span className="text-blue-900 font-bold block">Teleconsultation Video Link</span>
                    <span className="text-blue-700 text-[11px] truncate max-w-xs block">
                      {selectedAppointment.meetingLink}
                    </span>
                  </div>
                  <a
                    href={selectedAppointment.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-blue-600 text-white font-bold rounded-xl text-xs flex items-center gap-1"
                  >
                    Join <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <div className="p-3 bg-[#FAF9F4] rounded-2xl border border-[#E4DED4] text-[11px] text-[#66736D]">
                <p>
                  <strong>Reminders Active:</strong> 24 hours prior reminder and 1 hour prior reminder are scheduled on the patient's routine board.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-5 py-2 bg-[#176B61] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
