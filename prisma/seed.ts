import { PrismaClient, RoleType, AppointmentStatus, LabTestStatus, TicketStatus, TicketPriority } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_DEMO_PASSWORD = 'password123';
const ADMIN_BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || '1812';

async function main() {
  console.log('--- Starting Idempotent Database Seed ---');

  // Compute password hashes once
  const defaultPasswordHash = bcrypt.hashSync(DEFAULT_DEMO_PASSWORD, 10);
  const adminPasswordHash = bcrypt.hashSync(ADMIN_BOOTSTRAP_PASSWORD, 10);

  console.log('Seeding / Upserting Roles...');
  const rolePatient = await prisma.role.upsert({
    where: { name: RoleType.PATIENT },
    update: {},
    create: { name: RoleType.PATIENT, description: 'Hospital patient with access to own medical records' },
  });
  const roleDoctor = await prisma.role.upsert({
    where: { name: RoleType.DOCTOR },
    update: {},
    create: { name: RoleType.DOCTOR, description: 'Medical doctor with assigned care relationship access' },
  });
  const roleReceptionist = await prisma.role.upsert({
    where: { name: RoleType.RECEPTIONIST },
    update: {},
    create: { name: RoleType.RECEPTIONIST, description: 'Hospital front desk receptionist for scheduling' },
  });
  const roleAdmin = await prisma.role.upsert({
    where: { name: RoleType.ADMIN },
    update: {},
    create: { name: RoleType.ADMIN, description: 'Hospital system administrator' },
  });

  console.log('Seeding / Upserting 4 AI Agents...');
  const agents = [
    {
      id: 'appointment-agent',
      name: 'Appointment Agent',
      description: 'Handles doctor discovery, availability checking, and appointment booking/rescheduling.',
      roleDescription: 'Hospital scheduling concierge operating within appointment database constraints.',
      allowedTools: JSON.stringify([
        'get_doctors',
        'get_available_slots',
        'book_appointment',
        'reschedule_appointment',
        'cancel_appointment',
        'validate_appointment_booking',
      ]),
    },
    {
      id: 'records-agent',
      name: 'Patient Records Agent',
      description: 'Retrieves authorized patient clinical profiles, medical history, and prescriptions.',
      roleDescription: 'Secure clinical records specialist enforcing patient-boundary authorizations.',
      allowedTools: JSON.stringify([
        'get_patient_profile',
        'get_medical_history',
        'get_visit_summary',
        'get_prescriptions',
      ]),
    },
    {
      id: 'lab-agent',
      name: 'Lab Report Agent',
      description: 'Retrieves lab test status and explains synthetic diagnostic results in plain language.',
      roleDescription: 'Diagnostic explainer that translates synthetic metrics without diagnosing.',
      allowedTools: JSON.stringify([
        'get_lab_status',
        'get_lab_report',
        'get_lab_tests',
        'request_doctor_review',
      ]),
    },
    {
      id: 'care-agent',
      name: 'Care Coordinator Agent',
      description: 'Provides hospital information, FAQ lookup, support tickets, and agent routing.',
      roleDescription: 'Hospital navigator and care coordinator with delegation and handoff capabilities.',
      allowedTools: JSON.stringify([
        'search_hospital_faq',
        'create_support_ticket',
        'create_followup_request',
        'request_staff_assistance',
        'transfer_to_agent',
      ]),
    },
  ];

  for (const agent of agents) {
    await prisma.aIAgent.upsert({
      where: { id: agent.id },
      update: agent,
      create: agent,
    });
  }

  console.log('Seeding / Upserting 5 Departments...');
  const departmentsData = [
    { name: 'Cardiology', code: 'CARD', description: 'Comprehensive heart, cardiovascular, and vascular care' },
    { name: 'Neurology', code: 'NEUR', description: 'Brain, nervous system, and neurological disorder care' },
    { name: 'Pediatrics', code: 'PEDI', description: 'Infant, child, and adolescent healthcare services' },
    { name: 'Orthopedics', code: 'ORTH', description: 'Musculoskeletal system, spine, joint, and trauma care' },
    { name: 'Oncology', code: 'ONCO', description: 'Cancer diagnostics, multidisciplinary therapy, and care' },
  ];

  const createdDepts: any[] = [];
  for (const dept of departmentsData) {
    const d = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name, description: dept.description },
      create: dept,
    });
    createdDepts.push(d);
  }

  console.log('Seeding / Upserting 6 Standard Lab Tests...');
  const labTestsData = [
    {
      code: 'CBC-01',
      name: 'Complete Blood Count',
      category: 'Hematology',
      standardUnit: 'cells/mcL',
      normalRange: 'RBC: 4.2-5.9 M/mcL, WBC: 4.5-11.0 K/mcL, Platelets: 150-450 K/mcL',
      description: 'Measures red blood cells, white blood cells, and platelets for overall health assessment.',
    },
    {
      code: 'LIPID-02',
      name: 'Lipid Panel',
      category: 'Biochemistry',
      standardUnit: 'mg/dL',
      normalRange: 'Total: <200 mg/dL, HDL: >40 mg/dL, LDL: <100 mg/dL, Triglycerides: <150 mg/dL',
      description: 'Measures total cholesterol, LDL, HDL, and triglycerides for cardiovascular risk evaluation.',
    },
    {
      code: 'CMP-03',
      name: 'Comprehensive Metabolic Panel',
      category: 'Biochemistry',
      standardUnit: 'mg/dL, mmol/L',
      normalRange: 'Glucose: 70-99 mg/dL, Creatinine: 0.6-1.2 mg/dL, Sodium: 135-145 mmol/L',
      description: 'Evaluates kidney and liver function, blood sugar levels, and electrolyte balance.',
    },
    {
      code: 'TSH-04',
      name: 'Thyroid Stimulating Hormone',
      category: 'Endocrinology',
      standardUnit: 'mIU/L',
      normalRange: '0.4 - 4.0 mIU/L',
      description: 'Screens and monitors thyroid gland disorders.',
    },
    {
      code: 'HBA1C-05',
      name: 'Hemoglobin A1c',
      category: 'Endocrinology',
      standardUnit: '%',
      normalRange: '<5.7% (Normal), 5.7%-6.4% (Prediabetes), >=6.5% (Diabetes)',
      description: 'Reflects average blood sugar control over the past 3 months.',
    },
    {
      code: 'URINE-06',
      name: 'Urinalysis Panel',
      category: 'Pathology',
      standardUnit: 'dipstick',
      normalRange: 'pH 5.0-8.0, Protein: Negative, Glucose: Negative, Ketones: Negative',
      description: 'Screens for urinary tract infections, kidney disorders, and metabolic conditions.',
    },
  ];

  const createdLabTests: any[] = [];
  for (const lt of labTestsData) {
    const test = await prisma.labTest.upsert({
      where: { code: lt.code },
      update: lt,
      create: lt,
    });
    createdLabTests.push(test);
  }

  console.log('Seeding / Upserting Admin and Receptionist users...');
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@hospital.com' },
    update: {
      passwordHash: adminPasswordHash,
      name: 'System Administrator',
      roleId: roleAdmin.id,
      mustChangePassword: true,
    },
    create: {
      email: 'admin@hospital.com',
      passwordHash: adminPasswordHash,
      name: 'System Administrator',
      roleId: roleAdmin.id,
      mustChangePassword: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'receptionist@hospital.com' },
    update: {
      passwordHash: defaultPasswordHash,
      name: 'Alice Harper (Receptionist)',
      roleId: roleReceptionist.id,
    },
    create: {
      email: 'receptionist@hospital.com',
      passwordHash: defaultPasswordHash,
      name: 'Alice Harper (Receptionist)',
      roleId: roleReceptionist.id,
    },
  });

  console.log('Seeding / Upserting 10 Doctors and Schedules...');
  const doctorsData = [
    { name: 'Dr. Sarah Mitchell', email: 'dr.mitchell@hospital.com', specialization: 'Interventional Cardiology', deptCode: 'CARD', fee: 150.00, license: 'MED-CARD-091' },
    { name: 'Dr. Marcus Vance', email: 'dr.vance@hospital.com', specialization: 'Clinical Cardiology & Electrophysiology', deptCode: 'CARD', fee: 140.00, license: 'MED-CARD-092' },
    { name: 'Dr. Elena Rostova', email: 'dr.rostova@hospital.com', specialization: 'Cognitive Neurology & Epilepsy', deptCode: 'NEUR', fee: 160.00, license: 'MED-NEUR-081' },
    { name: 'Dr. Julian Chen', email: 'dr.chen@hospital.com', specialization: 'Neurovascular & Stroke Care', deptCode: 'NEUR', fee: 155.00, license: 'MED-NEUR-082' },
    { name: 'Dr. Priya Sharma', email: 'dr.sharma@hospital.com', specialization: 'General Pediatrics & Development', deptCode: 'PEDI', fee: 110.00, license: 'MED-PEDI-071' },
    { name: 'Dr. David Kim', email: 'dr.kim@hospital.com', specialization: 'Pediatric Pulmonology & Allergy', deptCode: 'PEDI', fee: 125.00, license: 'MED-PEDI-072' },
    { name: 'Dr. Robert Torres', email: 'dr.torres@hospital.com', specialization: 'Joint Replacement & Arthroscopy', deptCode: 'ORTH', fee: 175.00, license: 'MED-ORTH-061' },
    { name: 'Dr. Jessica Adams', email: 'dr.adams@hospital.com', specialization: 'Spine & Sports Rehabilitation', deptCode: 'ORTH', fee: 165.00, license: 'MED-ORTH-062' },
    { name: 'Dr. Anthony Hayes', email: 'dr.hayes@hospital.com', specialization: 'Medical Oncology & Hematology', deptCode: 'ONCO', fee: 200.00, license: 'MED-ONCO-051' },
    { name: 'Dr. Claire Laurent', email: 'dr.laurent@hospital.com', specialization: 'Radiation Oncology & Immunotherapy', deptCode: 'ONCO', fee: 210.00, license: 'MED-ONCO-052' },
  ];

  const createdDoctors: any[] = [];
  for (const doc of doctorsData) {
    const dept = createdDepts.find((d) => d.code === doc.deptCode);
    const user = await prisma.user.upsert({
      where: { email: doc.email },
      update: {
        name: doc.name,
        roleId: roleDoctor.id,
      },
      create: {
        email: doc.email,
        passwordHash: defaultPasswordHash,
        name: doc.name,
        roleId: roleDoctor.id,
      },
    });

    const doctor = await prisma.doctor.upsert({
      where: { userId: user.id },
      update: {
        departmentId: dept.id,
        specialization: doc.specialization,
        licenseNumber: doc.license,
        consultationFee: doc.fee,
      },
      create: {
        userId: user.id,
        departmentId: dept.id,
        specialization: doc.specialization,
        licenseNumber: doc.license,
        consultationFee: doc.fee,
      },
    });

    // Check availability
    const existingAvail = await prisma.doctorAvailability.findFirst({
      where: { doctorId: doctor.id },
    });

    if (!existingAvail) {
      for (let day = 1; day <= 5; day++) {
        await prisma.doctorAvailability.create({
          data: {
            doctorId: doctor.id,
            dayOfWeek: day,
            startTime: '09:00',
            endTime: '17:00',
            slotMinutes: 30,
          },
        });
      }
    }

    createdDoctors.push({ ...doctor, user, department: dept });
  }

  console.log('Seeding / Upserting 50 Patients...');
  const firstNames = [
    'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'William',
    'Mia', 'James', 'Charlotte', 'Benjamin', 'Amelia', 'Lucas', 'Harper', 'Henry', 'Evelyn', 'Alexander',
    'Abigail', 'Michael', 'Emily', 'Daniel', 'Elizabeth', 'Matthew', 'Mila', 'Aiden', 'Ella', 'Jackson',
    'Avery', 'Logan', 'Sofia', 'David', 'Camila', 'Joseph', 'Aria', 'Samuel', 'Scarlett', 'Sebastian',
    'Victoria', 'Jack', 'Madison', 'Owen', 'Luna', 'Carter', 'Grace', 'Wyatt', 'Chloe', 'Jayden'
  ];
  const lastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
    'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
    'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
    'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
    'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'
  ];

  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const allergiesList = [
    'Penicillin', 'Sulfa drugs', 'Latex', 'Peanuts', 'None known', 'Aspirin', 'Ibuprofen', 'Iodine contrast'
  ];
  const chronicList = [
    'Mild hypertension', 'Type 2 Diabetes (controlled)', 'Asthma', 'Seasonal rhinitis', 'Hyperlipidemia', 'None'
  ];

  const createdPatients: any[] = [];
  for (let i = 0; i < 50; i++) {
    const firstName = firstNames[i];
    const lastName = lastNames[i];
    const email = `patient${i + 1}@example.com`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: `${firstName} ${lastName}`,
        roleId: rolePatient.id,
      },
      create: {
        email,
        passwordHash: defaultPasswordHash,
        name: `${firstName} ${lastName}`,
        roleId: rolePatient.id,
      },
    });

    const birthYear = 1955 + (i * 13) % 45;
    const birthMonth = (i % 12) + 1;
    const birthDay = ((i * 3) % 27) + 1;
    const mrn = `MRN-2026-${String(1001 + i).padStart(5, '0')}`;

    const patient = await prisma.patient.upsert({
      where: { userId: user.id },
      update: {
        mrn,
        gender: i % 2 === 0 ? 'Female' : 'Male',
        bloodGroup: bloodGroups[i % bloodGroups.length],
        allergies: allergiesList[i % allergiesList.length],
        chronicConditions: chronicList[i % chronicList.length],
      },
      create: {
        userId: user.id,
        mrn,
        dateOfBirth: new Date(`${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`),
        gender: i % 2 === 0 ? 'Female' : 'Male',
        bloodGroup: bloodGroups[i % bloodGroups.length],
        phone: `+1-555-${String(200 + i).padStart(3, '0')}-${String(1000 + i * 7).slice(0, 4)}`,
        emergencyContact: `Emergency Contact (${lastName}) - 555-01${String(i).padStart(2, '0')}`,
        address: `${100 + i * 4} Healthcare Blvd, Suite ${i + 1}, Metropolis`,
        allergies: allergiesList[i % allergiesList.length],
        chronicConditions: chronicList[i % chronicList.length],
      },
    });

    createdPatients.push({ ...patient, user });
  }

  // Doctor-Patient Assignments (Phase 2 & Phase 4 requirement)
  console.log('Seeding / Upserting Doctor-Patient Assignments...');
  for (let i = 0; i < 50; i++) {
    const patient = createdPatients[i];
    // Assign each patient to 1-2 doctors based on index
    const primaryDoctor = createdDoctors[i % createdDoctors.length];
    await prisma.doctorPatientAssignment.upsert({
      where: {
        doctorId_patientId: {
          doctorId: primaryDoctor.id,
          patientId: patient.id,
        },
      },
      update: { active: true },
      create: {
        doctorId: primaryDoctor.id,
        patientId: patient.id,
        assignedBy: adminUser.id,
        notes: `Initial clinical care assignment for ${patient.user.name} under ${primaryDoctor.user.name}.`,
        active: true,
      },
    });

    if (i % 3 === 0) {
      const secondaryDoctor = createdDoctors[(i + 1) % createdDoctors.length];
      await prisma.doctorPatientAssignment.upsert({
        where: {
          doctorId_patientId: {
            doctorId: secondaryDoctor.id,
            patientId: patient.id,
          },
        },
        update: { active: true },
        create: {
          doctorId: secondaryDoctor.id,
          patientId: patient.id,
          assignedBy: adminUser.id,
          notes: `Consulting specialist assignment for ${secondaryDoctor.user.name}.`,
          active: true,
        },
      });
    }
  }

  // Check Appointments count
  const apptCount = await prisma.appointment.count();
  if (apptCount < 100) {
    console.log(`Seeding 100 Appointments (current count: ${apptCount})...`);
    const appointmentStatuses = [
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.SCHEDULED,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.RESCHEDULED,
    ];

    const appointmentReasons = [
      'Cardiovascular routine examination',
      'Follow-up after blood pressure medication adjustment',
      'Persistent migraine and neurological consult',
      'Knee pain assessment and mobility evaluation',
      'Annual pediatric wellness check',
      'Post-operative joint follow-up',
      'Oncology follow-up and treatment review',
      'Chest tightness and exertion monitoring',
      'Chronic cough and asthma review',
      'Laboratory results review with specialist',
    ];

    const now = new Date();
    for (let i = 0; i < 100; i++) {
      const patient = createdPatients[i % createdPatients.length];
      const doctor = createdDoctors[i % createdDoctors.length];
      const status = appointmentStatuses[i % appointmentStatuses.length];
      const reason = appointmentReasons[i % appointmentReasons.length];

      const dayOffset = (i % 30) - 15;
      const slotHour = 9 + (i % 7);
      const slotMin = (i % 2 === 0) ? '00' : '30';

      const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, slotHour, Number(slotMin));
      const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

      // Check for slot collision before creating
      const existing = await prisma.appointment.findFirst({
        where: {
          doctorId: doctor.id,
          startTime,
        },
      });

      if (!existing) {
        const appt = await prisma.appointment.create({
          data: {
            patientId: patient.id,
            doctorId: doctor.id,
            startTime,
            endTime,
            status,
            reason,
            notes: `Synthetic booking record #${i + 1} for demo purposes.`,
          },
        });

        if (status === AppointmentStatus.COMPLETED || dayOffset < 0) {
          await prisma.patientVisit.create({
            data: {
              patientId: patient.id,
              doctorId: doctor.id,
              appointmentId: appt.id,
              visitDate: startTime,
              summary: `Consultation with ${doctor.user.name} regarding: ${reason}. Patient reported good progress.`,
              vitals: JSON.stringify({
                bp: `${115 + (i % 20)}/${75 + (i % 12)} mmHg`,
                pulse: 68 + (i % 22),
                temp: '98.6 F',
                spo2: '99%',
              }),
              diagnosis: `Managed: ${reason}. Stable vital signs and condition.`,
            },
          });
        }
      }
    }
  }

  // Ensure deterministic test appointment exists for verification tests
  const testPatient = createdPatients[0];
  const testDoctor = createdDoctors[0];
  await prisma.appointment.upsert({
    where: { id: '954770a2-5466-497d-9af9-83681f747286' },
    update: {
      status: AppointmentStatus.SCHEDULED,
      reason: 'Cardiovascular routine examination',
    },
    create: {
      id: '954770a2-5466-497d-9af9-83681f747286',
      patientId: testPatient.id,
      doctorId: testDoctor.id,
      startTime: new Date('2026-11-15T10:00:00.000Z'),
      endTime: new Date('2026-11-15T10:30:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
      reason: 'Cardiovascular routine examination',
      notes: 'Deterministic test appointment for verification suite.',
    },
  });

  // Check Medical Records count
  const recordCount = await prisma.medicalRecord.count();
  if (recordCount < 50) {
    console.log(`Seeding 50 Medical Records (current count: ${recordCount})...`);
    const recordTypes = ['Clinical Note', 'Cardiology Consult', 'Neurology Evaluation', 'Annual Physical', 'Discharge Summary'];
    for (let i = 0; i < 50; i++) {
      const patient = createdPatients[i];
      const doctor = createdDoctors[i % createdDoctors.length];
      const recType = recordTypes[i % recordTypes.length];

      await prisma.medicalRecord.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          recordType: recType,
          title: `${recType} - ${patient.user.name}`,
          content: `Synthetic clinical observation note for patient ${patient.user.name} (${patient.mrn}). Observed baseline status: ${patient.chronicConditions || 'healthy'}. Medication tolerance noted. Recommended regular follow-up and monitoring.`,
          attachments: JSON.stringify(['clinical_summary_note.pdf']),
        },
      });
    }
  }

  // Check Lab Reports count
  const labReportCount = await prisma.labReport.count();
  if (labReportCount < 50) {
    console.log(`Seeding 50 Lab Reports (current count: ${labReportCount})...`);
    const labReportStatuses = [LabTestStatus.COMPLETED, LabTestStatus.COMPLETED, LabTestStatus.IN_PROGRESS, LabTestStatus.REVIEW_REQUESTED, LabTestStatus.REVIEWED];
    for (let i = 0; i < 50; i++) {
      const patient = createdPatients[i];
      const test = createdLabTests[i % createdLabTests.length];
      const doctor = createdDoctors[i % createdDoctors.length];
      const status = labReportStatuses[i % labReportStatuses.length];

      let resultValues: Record<string, any> = {};
      if (test.code === 'CBC-01') {
        resultValues = {
          white_blood_cells: `${(5.5 + (i % 4) * 0.8).toFixed(1)} K/mcL (Normal: 4.5-11.0)`,
          red_blood_cells: `${(4.4 + (i % 3) * 0.4).toFixed(2)} M/mcL (Normal: 4.2-5.9)`,
          hemoglobin: `${(13.5 + (i % 3) * 0.5).toFixed(1)} g/dL (Normal: 12.0-17.5)`,
          platelets: `${220 + (i % 8) * 15} K/mcL (Normal: 150-450)`,
        };
      } else if (test.code === 'LIPID-02') {
        resultValues = {
          total_cholesterol: `${175 + (i % 9) * 6} mg/dL (Desirable: <200)`,
          hdl_cholesterol: `${48 + (i % 6) * 4} mg/dL (Optimal: >40)`,
          ldl_cholesterol: `${98 + (i % 8) * 5} mg/dL (Optimal: <100)`,
          triglycerides: `${125 + (i % 7) * 7} mg/dL (Normal: <150)`,
        };
      } else {
        resultValues = {
          glucose_fasting: `${85 + (i % 5) * 4} mg/dL (Normal: 70-99)`,
          creatinine: `${(0.85 + (i % 4) * 0.08).toFixed(2)} mg/dL (Normal: 0.6-1.2)`,
          sodium: `${138 + (i % 5)} mmol/L (Normal: 135-145)`,
          potassium: `${(4.1 + (i % 4) * 0.2).toFixed(1)} mmol/L (Normal: 3.5-5.0)`,
        };
      }

      await prisma.labReport.create({
        data: {
          patientId: patient.id,
          labTestId: test.id,
          reviewedById: status === LabTestStatus.REVIEWED ? doctor.id : null,
          status,
          resultValues: JSON.stringify(resultValues),
          clinicalSummary: `Synthetic lab report for ${test.name}. Metrics align with expected clinical values. No urgent anomalies flagged.`,
          completedAt: status === LabTestStatus.COMPLETED || status === LabTestStatus.REVIEWED ? new Date() : null,
          doctorNotes: status === LabTestStatus.REVIEWED ? 'Reviewed by attending physician. Results consistent with patient recovery.' : null,
        },
      });
    }
  }

  // Check Prescriptions count
  const prescCount = await prisma.prescription.count();
  if (prescCount < 30) {
    console.log(`Seeding 30 Prescriptions (current count: ${prescCount})...`);
    const medications = [
      { med: 'Lisinopril', dosage: '10mg', freq: 'Once daily with water' },
      { med: 'Atorvastatin', dosage: '20mg', freq: 'Once daily at bedtime' },
      { med: 'Metformin', dosage: '500mg', freq: 'Twice daily with meals' },
      { med: 'Amoxicillin', dosage: '500mg', freq: 'Every 8 hours for 7 days' },
      { med: 'Albuterol Inhaler', dosage: '90mcg', freq: '2 puffs as needed for shortness of breath' },
      { med: 'Levothyroxine', dosage: '50mcg', freq: 'Once daily 30 min before breakfast' },
    ];

    for (let i = 0; i < 30; i++) {
      const patient = createdPatients[i];
      const doctor = createdDoctors[i % createdDoctors.length];
      const m = medications[i % medications.length];

      await prisma.prescription.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          medication: m.med,
          dosage: m.dosage,
          frequency: m.freq,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          instructions: `Take as prescribed. Contact clinic if adverse symptoms appear.`,
          active: true,
        },
      });
    }
  }

  // Check Support Tickets count
  const ticketCount = await prisma.supportTicket.count();
  if (ticketCount < 20) {
    console.log(`Seeding 20 Support Tickets (current count: ${ticketCount})...`);
    const ticketCategories = ['Billing', 'Navigation', 'Appointment Inquiry', 'Medical Records Access', 'Insurance Question'];
    for (let i = 0; i < 20; i++) {
      const patient = createdPatients[i];
      const cat = ticketCategories[i % ticketCategories.length];

      await prisma.supportTicket.create({
        data: {
          ticketNumber: `TICK-2026-${String(2001 + i).padStart(5, '0')}`,
          patientId: patient.id,
          createdById: patient.userId,
          category: cat,
          subject: `Request for assistance regarding ${cat}`,
          description: `Synthetic patient inquiry ticket created for testing support workflows. Subject matter: ${cat}.`,
          status: i % 3 === 0 ? TicketStatus.RESOLVED : TicketStatus.OPEN,
          priority: i % 4 === 0 ? TicketPriority.HIGH : TicketPriority.MEDIUM,
        },
      });
    }
  }

  // Seed initial PatientSymptomRequest & AIRecommendation
  const symptomCount = await prisma.patientSymptomRequest.count();
  if (symptomCount === 0) {
    console.log('Seeding initial PatientSymptomRequest and AIRecommendation...');
    const patient1 = createdPatients[0];
    const cardiologyDoctor = createdDoctors[0]; // Dr. Sarah Mitchell
    const cardiologyDoctor2 = createdDoctors[1]; // Dr. Marcus Vance

    const symptomReq = await prisma.patientSymptomRequest.create({
      data: {
        userId: patient1.user.id,
        patientId: patient1.id,
        description: 'Experiencing recurrent mild chest tightness after exercise and slight shortness of breath.',
        urgencyFlag: false,
      },
    });

    await prisma.aIRecommendation.create({
      data: {
        symptomRequestId: symptomReq.id,
        recommendedSpecialty: 'Cardiology',
        recommendedDoctorIds: [cardiologyDoctor.id, cardiologyDoctor2.id],
        aiRationale: 'Symptoms of chest tightness and exertional shortness of breath are best evaluated by a cardiovascular specialist.',
        selectedDoctorId: cardiologyDoctor.id,
        status: 'PENDING',
      },
    });
  }

  console.log('Database Seeding Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('Seed Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
