import { PrismaClient, RoleType } from '@prisma/client';
import { AGENT_METADATA_LIST } from '@hospital/shared';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_DEMO_PASSWORD = 'password123';
const ADMIN_BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || '1812';

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

/** Initialize application configuration, administrator account, and 10 dummy doctors. */
async function main(): Promise<void> {
  console.log('--- Initializing Database Seed ---');

  console.log('Seeding / Upserting Roles...');
  for (const name of Object.values(RoleType)) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log('Seeding / Upserting AI Agents...');
  for (const agent of AGENT_METADATA_LIST) {
    const data = {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      roleDescription: agent.roleDescription,
      allowedTools: JSON.stringify(agent.allowedTools),
    };
    await prisma.aIAgent.upsert({ where: { id: agent.id }, update: data, create: data });
  }

  console.log('Ensuring Administrator account exists...');
  const existingAdmin = await prisma.user.findUnique({ where: { email: 'admin@hospital.com' } });
  if (!existingAdmin) {
    const roleAdmin = await prisma.role.findUniqueOrThrow({ where: { name: RoleType.ADMIN } });
    await prisma.user.create({
      data: {
        email: 'admin@hospital.com',
        name: 'System Administrator',
        roleId: roleAdmin.id,
        passwordHash: await bcrypt.hash(ADMIN_BOOTSTRAP_PASSWORD, 12),
        mustChangePassword: true,
      },
    });
    console.log('Administrator account initialized.');
  } else {
    console.log('Administrator account retained.');
  }

  console.log('Seeding / Upserting 10 Dummy Doctors and Schedules...');
  const roleDoctor = await prisma.role.findUniqueOrThrow({ where: { name: RoleType.DOCTOR } });
  const doctorPasswordHash = bcrypt.hashSync(DEFAULT_DEMO_PASSWORD, 10);

  for (const doc of DUMMY_DOCTORS) {
    // 1. Ensure Department exists
    const department = await prisma.department.upsert({
      where: { code: doc.deptCode },
      update: { name: doc.deptName },
      create: {
        code: doc.deptCode,
        name: doc.deptName,
        description: `${doc.deptName} healthcare department`,
      },
    });

    // 2. Upsert Doctor User
    const user = await prisma.user.upsert({
      where: { email: doc.email },
      update: {
        name: doc.name,
        roleId: roleDoctor.id,
        isActive: true,
      },
      create: {
        email: doc.email,
        passwordHash: doctorPasswordHash,
        name: doc.name,
        roleId: roleDoctor.id,
        isActive: true,
      },
    });

    // 3. Upsert Doctor Profile
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
  }

  console.log('10 Dummy Doctors successfully seeded and configured.');
}

main()
  .catch((error: Error) => {
    console.error('Database initialization failed', { error: error.message });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
