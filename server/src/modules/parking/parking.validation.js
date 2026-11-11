import { z } from 'zod';

const dayHours = z.object({
  day: z.number().int().min(0).max(6),
  closed: z.boolean().default(false),
  openAt: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  closeAt: z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/),
}).strict().refine((hours) => hours.closed || timeInMinutes(hours.closeAt) > timeInMinutes(hours.openAt), 'Closing time must be later than opening time');

function timeInMinutes(value) {
  if (value === '24:00') return 24 * 60;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

const defaultHours = Array.from({ length: 7 }, (_, day) => ({ day, closed: false, openAt: '00:00', closeAt: '24:00' }));
const addressSchema = z.object({
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).optional().default(''),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(2).max(20),
  country: z.string().trim().min(2).max(80),
}).strict();
const hoursSchema = z.array(dayHours).length(7).default(defaultHours)
  .refine((hours) => new Set(hours.map((item) => item.day)).size === 7, 'Operating hours must contain one entry for each weekday');
const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
}).strict();

export const locationCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1500).optional().default(''),
  address: addressSchema,
  coordinates: coordinatesSchema,
  timezone: z.string().trim().min(3).max(64).default('Asia/Kolkata'),
  operatingHours: hoursSchema,
  ownerId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
}).strict();

export const locationUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(1500).optional(),
  address: addressSchema.optional(),
  coordinates: coordinatesSchema.optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  operatingHours: hoursSchema.optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one location field to update');

export const slotCreateSchema = z.object({
  slotNumber: z.string().trim().min(1).max(24).regex(/^[a-z\d][a-z\d._-]*$/i).transform((value) => value.toUpperCase()),
  vehicleType: z.enum(['car', 'motorcycle', 'electric_vehicle']),
  hourlyPricePaise: z.number().int().min(1).max(100_000_000),
}).strict();

export const slotUpdateSchema = z.object({
  slotNumber: z.string().trim().min(1).max(24).regex(/^[a-z\d][a-z\d._-]*$/i).transform((value) => value.toUpperCase()).optional(),
  vehicleType: z.enum(['car', 'motorcycle', 'electric_vehicle']).optional(),
  hourlyPricePaise: z.number().int().min(1).max(100_000_000).optional(),
  status: z.enum(['active', 'maintenance', 'inactive']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one slot field to update');

export const bookingCreateSchema = z.object({
  locationId: z.string().regex(/^[a-f\d]{24}$/i),
  slotId: z.string().regex(/^[a-f\d]{24}$/i),
  startAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
  endAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
}).strict();

const isoDate = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const availabilityQueryShape = { startAt: isoDate.optional(), endAt: isoDate.optional() };
export const availabilityQuerySchema = z.object(availabilityQueryShape)
  .refine((value) => Boolean(value.startAt) === Boolean(value.endAt), 'Both startAt and endAt are required together');
export const slotAvailabilityQuerySchema = z.object({ ...availabilityQueryShape, vehicleType: z.enum(['car', 'motorcycle', 'electric_vehicle']).optional() })
  .refine((value) => Boolean(value.startAt) === Boolean(value.endAt), 'Both startAt and endAt are required together');

export const searchQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  city: z.string().trim().max(100).optional(),
  vehicleType: z.enum(['car', 'motorcycle', 'electric_vehicle']).optional(),
  maxHourlyPricePaise: z.coerce.number().int().min(1).max(100_000_000).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(100).default(25),
  startAt: isoDate.optional(),
  endAt: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).refine((value) => (value.latitude !== undefined) === (value.longitude !== undefined), 'Both latitude and longitude are required together')
  .refine((value) => Boolean(value.startAt) === Boolean(value.endAt), 'Both startAt and endAt are required together');
