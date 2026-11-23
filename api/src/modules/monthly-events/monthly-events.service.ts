import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CurrentUserData } from '../../common/auth/current-user';
import { httpError } from '../../common/http-errors';
import { isoMonth, pyUtcNowIso } from '../../common/py-compat';
import { DataStoreService, Dict } from '../../persistence/data-store.service';
import { EventInput, MIN_ATTENDEES_MSG, MIN_EVENT_ATTENDEES } from '../events/events.schemas';

/** Shared monthly-event logic (used by the monthly-events and admin controllers). */
@Injectable()
export class MonthlyEventsService {
  constructor(private readonly store: DataStoreService) {}

  async resolveAssignedOrganizer(month: number): Promise<Dict | undefined> {
    const assignments = await this.store.monthlyAssignmentsRepo.read();
    const assignedName = assignments[String(month)];
    if (!assignedName) return undefined;
    return (await this.store.getAllowedUsers()).find((user) => user.name === assignedName);
  }

  assertMonthlyPayloadComplete(payload: EventInput): void {
    const missing: string[] = [];
    if (!(payload.location && payload.location.trim())) missing.push('ubicación');
    if (payload.amount === null) missing.push('monto');
    if (!(payload.imageUrl && payload.imageUrl.trim())) missing.push('imagen');
    if (missing.length) throw httpError(400, `Campos obligatorios faltantes: ${missing.join(', ')}.`);
  }

  /**
   * Creates the monthly event for `month`. Organizers can only create their own
   * month (`requireAssignedUser`); admins can create any month.
   */
  async createMonthlyEvent(
    month: number,
    payload: EventInput,
    currentUser: CurrentUserData,
    requireAssignedUser: boolean,
  ): Promise<Dict> {
    if (!(month >= 1 && month <= 12)) throw httpError(400, 'Mes inválido.');
    if (payload.attendeeIds.length < MIN_EVENT_ATTENDEES) throw httpError(400, MIN_ATTENDEES_MSG);
    this.assertMonthlyPayloadComplete(payload);

    const assignments = await this.store.monthlyAssignmentsRepo.read();
    const assignedName = assignments[String(month)];
    if (!assignedName) throw httpError(404, 'No hay organizador asignado para este mes.');

    const assignedUser = (await this.store.getAllowedUsers()).find((user) => user.name === assignedName);
    if (!assignedUser) {
      throw httpError(400, 'El organizador asignado no está en la lista de usuarios habilitados.');
    }

    if (requireAssignedUser && assignedUser.id !== currentUser.id) {
      throw httpError(403, 'Este mes no te toca organizar a vos.');
    }

    const events = await this.store.eventsRepo.read();
    const exists = events.some((item) => item.eventType === 'monthly_event' && isoMonth(item.date) === month);
    if (exists) throw httpError(400, 'Ese mes ya tiene evento del mes.');

    const now = pyUtcNowIso();
    const event = {
      ...payload,
      eventType: 'monthly_event',
      organizerId: assignedUser.id,
      id: randomUUID(),
      creatorId: currentUser.id,
      createdAt: now,
      updatedAt: now,
    };
    events.push(event);
    await this.store.eventsRepo.write(events);
    return event;
  }
}
