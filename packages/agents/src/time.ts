import { DateTime } from 'luxon';

export function hospitalTimezone(): string {
  const zone = process.env.HOSPITAL_TIMEZONE ?? 'Asia/Kolkata';
  if (!DateTime.now().setZone(zone).isValid) throw new Error(`Invalid HOSPITAL_TIMEZONE: ${zone}`);
  return zone;
}

export function hospitalDate(date: Date): string {
  return DateTime.fromJSDate(date, { zone: hospitalTimezone() }).toFormat('yyyy-MM-dd');
}

export function localTimeToUtc(date: string, time: string, zone: string): Date {
  const value = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !value.isValid || value.toFormat('yyyy-MM-dd HH:mm') !== `${date} ${time}`) {
    throw Object.assign(new Error(`Invalid or nonexistent hospital date/time: ${date} ${time} (${zone}).`), { statusCode: 400 });
  }
  const alternatives = value.getPossibleOffsets();
  if (alternatives.length > 1) throw Object.assign(new Error(`Ambiguous hospital date/time: ${date} ${time} (${zone}). Supply an ISO timestamp with an explicit UTC offset.`), { statusCode: 400 });
  return value.toUTC().toJSDate();
}

export function parseAppointmentTime(value: string): Date {
  const parsed = DateTime.fromISO(value, { zone: hospitalTimezone(), setZone: true });
  if (!parsed.isValid || !value.includes('T')) throw Object.assign(new Error(`Invalid appointment timestamp: ${value}. Use ISO 8601 or hospital local YYYY-MM-DDTHH:mm.`), { statusCode: 400 });
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(value)) return localTimeToUtc(parsed.toFormat('yyyy-MM-dd'), parsed.toFormat('HH:mm'), hospitalTimezone());
  return parsed.toUTC().toJSDate();
}

export function formatHospitalTime(date: Date): string {
  return `${DateTime.fromJSDate(date, { zone: hospitalTimezone() }).toFormat('dd LLL yyyy, hh:mm a ZZZZ')} (${hospitalTimezone()})`;
}

export function tomorrowDate(now: Date): string {
  return DateTime.fromJSDate(now, { zone: hospitalTimezone() }).plus({ days: 1 }).toFormat('yyyy-MM-dd');
}
