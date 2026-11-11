import { Router } from 'express';
import { authenticate, requireRoles } from '../auth/auth.middleware.js';
import { ParkingSlot } from '../../models/ParkingSlot.js';
import { ensureNoFutureBookingsForSlot, getManagedLocation, isValidId, slotView } from './parking.service.js';
import { slotCreateSchema, slotUpdateSchema } from './parking.validation.js';
import { publishAvailability } from '../../realtime/availability.js';

export const slotRouter = Router({ mergeParams: true });

function invalid(res, parsed) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted fields', fields: parsed.error.flatten().fieldErrors } });
}

slotRouter.post('/:locationId/slots', authenticate, requireRoles('parking_owner', 'admin'), async (req, res, next) => {
  const parsed = slotCreateSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  try {
    const location = await getManagedLocation(req.params.locationId, req.user);
    if (!location) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Parking location not found' } });
    if (location.status !== 'active') return res.status(409).json({ error: { code: 'LOCATION_INACTIVE', message: 'Slots cannot be added to an inactive location' } });
    const slot = await ParkingSlot.create({ ...parsed.data, locationId: location.id });
    publishAvailability(location.id, { slotId: slot.id, slotStatus: slot.status });
    return res.status(201).json({ slot: slotView(slot) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: { code: 'DUPLICATE_SLOT_NUMBER', message: 'This slot number is already used at this location' } });
    return next(error);
  }
});

slotRouter.patch('/:locationId/slots/:slotId', authenticate, requireRoles('parking_owner', 'admin'), async (req, res, next) => {
  const parsed = slotUpdateSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  if (!isValidId(req.params.slotId)) return res.status(404).json({ error: { code: 'SLOT_NOT_FOUND', message: 'Parking slot not found' } });
  try {
    const location = await getManagedLocation(req.params.locationId, req.user);
    if (!location) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Parking location not found' } });
    const slot = await ParkingSlot.findOne({ _id: req.params.slotId, locationId: location.id });
    if (!slot) return res.status(404).json({ error: { code: 'SLOT_NOT_FOUND', message: 'Parking slot not found' } });
    const nextStatus = parsed.data.status ?? slot.status;
    const bookingRelevantChange = parsed.data.vehicleType !== undefined || nextStatus !== 'active';
    if (bookingRelevantChange && await ensureNoFutureBookingsForSlot(slot.id)) {
      return res.status(409).json({ error: { code: 'SLOT_HAS_RESERVATIONS', message: 'This slot has upcoming reservations and cannot be changed yet' } });
    }
    Object.assign(slot, parsed.data);
    await slot.save();
    publishAvailability(location.id, { slotId: slot.id, slotStatus: slot.status });
    return res.json({ slot: slotView(slot) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: { code: 'DUPLICATE_SLOT_NUMBER', message: 'This slot number is already used at this location' } });
    return next(error);
  }
});

slotRouter.delete('/:locationId/slots/:slotId', authenticate, requireRoles('parking_owner', 'admin'), async (req, res, next) => {
  if (!isValidId(req.params.slotId)) return res.status(404).json({ error: { code: 'SLOT_NOT_FOUND', message: 'Parking slot not found' } });
  try {
    const location = await getManagedLocation(req.params.locationId, req.user);
    if (!location) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Parking location not found' } });
    const slot = await ParkingSlot.findOne({ _id: req.params.slotId, locationId: location.id });
    if (!slot) return res.status(404).json({ error: { code: 'SLOT_NOT_FOUND', message: 'Parking slot not found' } });
    if (await ensureNoFutureBookingsForSlot(slot.id)) return res.status(409).json({ error: { code: 'SLOT_HAS_RESERVATIONS', message: 'This slot has upcoming reservations and cannot be deactivated yet' } });
    slot.status = 'inactive';
    await slot.save();
    publishAvailability(location.id, { slotId: slot.id, slotStatus: slot.status });
    return res.status(204).end();
  } catch (error) { return next(error); }
});
