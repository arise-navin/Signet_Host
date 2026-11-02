import { createServer } from './backend/src/index.ts';
import { prisma } from './backend/src/db.ts';
import { availableDoctorSlots, careRelationshipFilter } from '@hospital/agents';
const {server,toolExecutor}=await createServer();await server.ready();
try {
 const execution=await prisma.agentExecution.findUniqueOrThrow({where:{id:'e9ef2eff-cea9-4b4b-82b9-6345512ce7ec'}});
 const user=await prisma.user.findUniqueOrThrow({where:{id:execution.userId},include:{role:true,doctor:true}});
 const doctorId='8e1fd503-4424-4653-82f0-e2f720119785';const patientId='335873cd-f846-4f83-95a9-22794559aa66';const startTime='2026-10-27T04:30:00.000Z';
 const assigned=await prisma.patient.findFirst({where:{id:patientId,...careRelationshipFilter(user.doctor!.id)},select:{id:true}});
 const before=await prisma.appointment.count({where:{doctorId,patientId,startTime:new Date(startTime)}});
 const result=await toolExecutor.executeTool('validate_appointment_booking',{doctorId,patientId,startTime,reason:'Synthetic test cardiology consultation'},{authUser:{id:user.id,email:user.email,name:user.name,role:user.role.name,doctorId:user.doctor!.id},agentId:'appointment-agent'},prisma,'read-only-verification');
 const recall=await toolExecutor.executeTool('get_booking_attempt',{}, {authUser:{id:user.id,email:user.email,name:user.name,role:user.role.name,doctorId:user.doctor!.id},agentId:'appointment-agent',conversationId:execution.conversationId!},prisma,'read-only-failed-outcome');
 const resolutions=await prisma.agentExecution.findMany({where:{userId:user.id,error:{contains:'Availability requires one verified doctor'}},select:{id:true,conversationId:true,error:true},take:4});
 console.log(JSON.stringify({actor:user.name,role:user.role.name,assignedPatient:!!assigned,ownDoctorId:user.doctor!.id,targetDoctorId:doctorId,preflight:{success:result.success,statusCode:result.statusCode,error:result.error},matchingAppointmentsBefore:before,matchingAppointmentsAfter:await prisma.appointment.count({where:{doctorId,patientId,startTime:new Date(startTime)}}),slotStillAvailable:(await availableDoctorSlots(doctorId,'2026-10-27',undefined,prisma)).includes(startTime),bookingConversation:execution.conversationId,recall:recall.data,resolutionFailures:resolutions},null,2));
}finally{await server.close();await prisma.$disconnect();}
