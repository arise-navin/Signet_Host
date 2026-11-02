import { PrismaClient, RoleType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import net from 'net';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment configurations
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config();

const PG_PORT = 5433;
const PG_DATA = path.join(rootDir, 'pgdata');
const PG_BIN_DIR = 'C:\\Program Files\\PostgreSQL\\18\\bin';

function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function ensureLocalPostgresRunning() {
  const open = await isPortOpen(PG_PORT);
  if (!open && fs.existsSync(PG_DATA)) {
    console.log(`Port ${PG_PORT} is not active. Starting local PostgreSQL cluster...`);
    const pgctlExe = path.join(PG_BIN_DIR, 'pg_ctl.exe');
    const logFile = path.join(PG_DATA, 'server.log');
    try {
      if (fs.existsSync(pgctlExe)) {
        execSync(`"${pgctlExe}" -D "${PG_DATA}" -l "${logFile}" start`, { stdio: 'ignore' });
      } else {
        execSync(`pg_ctl -D "${PG_DATA}" -l "${logFile}" start`, { stdio: 'ignore' });
      }
    } catch {
      // Ignore
    }
    // Wait for port
    for (let i = 0; i < 20; i++) {
      if (await isPortOpen(PG_PORT)) break;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

const activeDbUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_POOLED ||
  `postgresql://postgres:postgres@localhost:${PG_PORT}/hospital_ai_db?schema=public`;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: activeDbUrl,
    },
  },
});

const DEFAULT_DEMO_PASSWORD = 'password123';

export const DUMMY_DOCTORS = [
  {
    name: 'Dr. Alexander Bennett',
    email: 'dr.bennett@hospital.com',
    specialization: 'Heart Failure & Cardiac Transplantation',
    deptCode: 'CARD',
    deptName: 'Cardiology',
    fee: 165.0,
    license: 'MED-CARD-093',
    bio: 'Board-certified cardiologist specializing in advanced heart failure management, cardiomyopathy, and mechanical circulatory support.',
  },
  {
    name: 'Dr. Sophia Martinez',
    email: 'dr.martinez@hospital.com',
    specialization: 'Non-Invasive Cardiovascular Imaging',
    deptCode: 'CARD',
    deptName: 'Cardiology',
    fee: 145.0,
    license: 'MED-CARD-094',
    bio: 'Specialist in comprehensive echocardiography, cardiac CT/MRI imaging, and preventive cardiovascular diagnostics.',
  },
  {
    name: 'Dr. Raymond Scott',
    email: 'dr.scott@hospital.com',
    specialization: 'Neuromuscular Disorders & ALS',
    deptCode: 'NEUR',
    deptName: 'Neurology',
    fee: 170.0,
    license: 'MED-NEUR-083',
    bio: 'Senior neurologist focusing on neuromuscular medicine, motor neuron diseases, electromyography (EMG), and clinical neurophysiology.',
  },
  {
    name: 'Dr. Amara Okafor',
    email: 'dr.okafor@hospital.com',
    specialization: 'Neuro-Immunology & Multiple Sclerosis',
    deptCode: 'NEUR',
    deptName: 'Neurology',
    fee: 160.0,
    license: 'MED-NEUR-084',
    bio: 'Expert in neuro-immunological conditions, demyelinating diseases, autoimmune encephalitis, and advanced immunotherapy.',
  },
  {
    name: 'Dr. Lucas Zimmerman',
    email: 'dr.zimmerman@hospital.com',
    specialization: 'Pediatric Cardiology & Congenital Heart Care',
    deptCode: 'PEDI',
    deptName: 'Pediatrics',
    fee: 135.0,
    license: 'MED-PEDI-073',
    bio: 'Fellowship-trained pediatric cardiologist caring for infants, children, and teens with congenital and acquired heart conditions.',
  },
  {
    name: 'Dr. Maya Patel',
    email: 'dr.patel@hospital.com',
    specialization: 'Neonatal-Perinatal Medicine',
    deptCode: 'PEDI',
    deptName: 'Pediatrics',
    fee: 140.0,
    license: 'MED-PEDI-074',
    bio: 'Specialist caring for high-risk newborns, prematurity complications, and developmental follow-up in infant care.',
  },
  {
    name: 'Dr. Benjamin Clark',
    email: 'dr.clark@hospital.com',
    specialization: 'Orthopedic Trauma & Reconstructive Surgery',
    deptCode: 'ORTH',
    deptName: 'Orthopedics',
    fee: 180.0,
    license: 'MED-ORTH-063',
    bio: 'Orthopedic surgeon focusing on complex fractures, traumatic limb reconstruction, and minimally invasive bone restoration.',
  },
  {
    name: 'Dr. Hannah Lindqvist',
    email: 'dr.lindqvist@hospital.com',
    specialization: 'Pediatric Orthopedics & Scoliosis Care',
    deptCode: 'ORTH',
    deptName: 'Orthopedics',
    fee: 170.0,
    license: 'MED-ORTH-064',
    bio: 'Specialist in pediatric spinal deformities, pediatric sports injuries, limb alignment, and adolescent musculoskeletal growth.',
  },
  {
    name: 'Dr. Tariq Al-Mansoor',
    email: 'dr.almansoor@hospital.com',
    specialization: 'Surgical Oncology & Gastrointestinal Cancer',
    deptCode: 'ONCO',
    deptName: 'Oncology',
    fee: 215.0,
    license: 'MED-ONCO-053',
    bio: 'Surgical oncologist specializing in complex gastrointestinal, hepatobiliary, and pancreatic cancer resections.',
  },
  {
    name: 'Dr. Natalie Brooks',
    email: 'dr.brooks@hospital.com',
    specialization: 'Gynecologic Oncology & Targeted Therapeutics',
    deptCode: 'ONCO',
    deptName: 'Oncology',
    fee: 205.0,
    license: 'MED-ONCO-054',
    bio: 'Specialist in comprehensive multidisciplinary gynecologic oncology, precision genomics, and targeted biologic cancer therapies.',
  },
];

export async function addDummyDoctors() {
  await ensureLocalPostgresRunning();

  console.log('Connecting to database:', activeDbUrl.replace(/:[^:@]+@/, ':***@'));
  console.log(`Adding / Upserting ${DUMMY_DOCTORS.length} dummy doctors...`);

  const passwordHash = bcrypt.hashSync(DEFAULT_DEMO_PASSWORD, 10);

  // Ensure DOCTOR role exists
  const roleDoctor = await prisma.role.upsert({
    where: { name: RoleType.DOCTOR },
    update: {},
    create: {
      name: RoleType.DOCTOR,
      description: 'Medical doctor with assigned care relationship access',
    },
  });

  const results = [];

  for (const doc of DUMMY_DOCTORS) {
    // 1. Ensure department exists
    const department = await prisma.department.upsert({
      where: { code: doc.deptCode },
      update: { name: doc.deptName },
      create: {
        code: doc.deptCode,
        name: doc.deptName,
        description: `${doc.deptName} healthcare department`,
      },
    });

    // 2. Upsert user account
    const user = await prisma.user.upsert({
      where: { email: doc.email },
      update: {
        name: doc.name,
        roleId: roleDoctor.id,
        isActive: true,
      },
      create: {
        email: doc.email,
        passwordHash,
        name: doc.name,
        roleId: roleDoctor.id,
        isActive: true,
      },
    });

    // 3. Upsert doctor profile
    const doctor = await prisma.doctor.upsert({
      where: { userId: user.id },
      update: {
        departmentId: department.id,
        specialization: doc.specialization,
        licenseNumber: doc.license,
        consultationFee: doc.fee,
        bio: doc.bio,
        isActive: true,
      },
      create: {
        userId: user.id,
        departmentId: department.id,
        specialization: doc.specialization,
        licenseNumber: doc.license,
        consultationFee: doc.fee,
        bio: doc.bio,
        isActive: true,
      },
    });

    // 4. Ensure Monday-Friday schedule availability (09:00 - 17:00, 30 min slots)
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

    results.push({
      id: doctor.id,
      name: doc.name,
      email: doc.email,
      department: doc.deptName,
      specialization: doc.specialization,
      fee: `$${doc.fee.toFixed(2)}`,
      license: doc.license,
    });
  }

  console.log('\n--- Successfully Added / Upserted 10 Dummy Doctors ---');
  console.table(results, ['name', 'email', 'department', 'specialization', 'fee', 'license']);

  const totalDoctors = await prisma.doctor.count();
  console.log(`\nTotal doctors currently in database: ${totalDoctors}`);
}

async function main() {
  try {
    await addDummyDoctors();
  } catch (error) {
    console.error('Error adding dummy doctors:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute directly if run as main script
main();
