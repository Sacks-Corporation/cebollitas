import { Controller, Delete, Get, HttpCode, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CurrentUser, CurrentUserData } from '../../common/auth/current-user';
import { AdminOnly, Authenticated } from '../../common/auth/guards';
import { httpError } from '../../common/http-errors';
import { sendNoContent } from '../../common/no-content';
import { isoMonth, pySorted, pyUtcNowIso } from '../../common/py-compat';
import { opt, serializeDate } from '../../common/serialize';
import { pyStr } from '../../common/validation/py-schema';
import { ValidateRequest, VBody, VParams, VQuery } from '../../common/validation/request-validation';
import { VoteService } from '../../core/vote.service';
import { DataStoreService } from '../../persistence/data-store.service';
import { serializeUserRef } from '../users/users.schemas';
import {
  EventCreate,
  EventInput,
  EventListQuery,
  EventUpdate,
  MIN_ATTENDEES_MSG,
  MIN_EVENT_ATTENDEES,
  serializeEvent,
} from './events.schemas';

const EventIdParam = { event_id: pyStr() };

@Controller('api/events')
export class EventsController {
  constructor(
    private readonly store: DataStoreService,
    private readonly votes: VoteService,
  ) {}

  @Get()
  @Authenticated()
  @ValidateRequest({ query: EventListQuery })
  async listEvents(@VQuery() query: { month: number | null; type: string | null; attendeeId: string | null }) {
    let events = await this.store.eventsRepo.read();
    if (query.month) events = events.filter((event) => isoMonth(event.date) === query.month);
    if (query.type) events = events.filter((event) => event.eventType === query.type);
    if (query.attendeeId) events = events.filter((event) => (event.attendeeIds ?? []).includes(query.attendeeId));
    events = pySorted(events, (event) => [event.date, event.createdAt ?? ''], true);
    return events.map(serializeEvent);
  }

  @Post()
  @HttpCode(201)
  @Authenticated()
  @ValidateRequest({ body: EventCreate })
  async createEvent(@VBody() payload: EventInput, @CurrentUser() currentUser: CurrentUserData) {
    if (payload.attendeeIds.length < MIN_EVENT_ATTENDEES) throw httpError(400, MIN_ATTENDEES_MSG);

    const now = pyUtcNowIso();
    const event = { ...payload, id: randomUUID(), creatorId: currentUser.id, createdAt: now, updatedAt: now };

    const events = await this.store.eventsRepo.read();
    events.push(event);
    await this.store.eventsRepo.write(events);
    return serializeEvent(event);
  }

  @Get(':event_id')
  @Authenticated()
  @ValidateRequest({ params: EventIdParam })
  async getEvent(@VParams() params: { event_id: string }) {
    const event = (await this.store.eventsRepo.read()).find((item) => item.id === params.event_id);
    if (!event) throw httpError(404, 'Evento no encontrado.');
    return serializeEvent(event);
  }

  @Get(':event_id/detail')
  @Authenticated()
  @ValidateRequest({ params: EventIdParam })
  async getEventDetail(@VParams() params: { event_id: string }) {
    const eventId = params.event_id;
    const event = (await this.store.eventsRepo.read()).find((item) => item.id === eventId);
    if (!event) throw httpError(404, 'Evento no encontrado.');

    const usersById = new Map((await this.store.getAllowedUsers()).map((user) => [user.id, user]));
    const attendees = (event.attendeeIds ?? [])
      .map((attendeeId: string) => usersById.get(attendeeId))
      .filter((user: unknown) => user !== undefined)
      .map(serializeUserRef);
    const organizerUser = usersById.get(event.organizerId || '');

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      date: serializeDate(event.date),
      eventType: event.eventType,
      location: opt(event.location),
      amount: opt(event.amount),
      imageUrl: opt(event.imageUrl),
      imagePosition: opt(event.imagePosition),
      voteAverage: opt(event.voteAverage),
      generalAverage: await this.votes.getEventGeneralAverage(eventId),
      voteCount: await this.votes.countEventVotes(eventId),
      organizer: organizerUser ? serializeUserRef(organizerUser) : null,
      attendees,
    };
  }

  @Put(':event_id')
  @Authenticated()
  @ValidateRequest({ params: EventIdParam, body: EventUpdate })
  async updateEvent(
    @VParams() params: { event_id: string },
    @VBody() payload: EventInput,
    @CurrentUser() currentUser: CurrentUserData,
  ) {
    if (payload.attendeeIds.length < MIN_EVENT_ATTENDEES) throw httpError(400, MIN_ATTENDEES_MSG);

    const events = await this.store.eventsRepo.read();
    const idx = events.findIndex((item) => item.id === params.event_id);
    if (idx === -1) throw httpError(404, 'Evento no encontrado.');
    const event = events[idx];
    if (event.creatorId !== currentUser.id) throw httpError(403, 'Solo podés editar tus eventos.');

    const updated = {
      ...payload,
      id: event.id,
      creatorId: event.creatorId,
      createdAt: event.createdAt,
      updatedAt: pyUtcNowIso(),
    };
    events[idx] = updated;
    await this.store.eventsRepo.write(events);
    return serializeEvent(updated);
  }

  @Delete(':event_id')
  @AdminOnly()
  @ValidateRequest({ params: EventIdParam })
  async deleteEvent(@VParams() params: { event_id: string }, @Res() res: Response): Promise<void> {
    const events = await this.store.eventsRepo.read();
    const idx = events.findIndex((item) => item.id === params.event_id);
    if (idx === -1) throw httpError(404, 'Evento no encontrado.');
    events.splice(idx, 1);
    await this.store.eventsRepo.write(events);

    // Drop any votes that referenced the deleted event so the votes store
    // doesn't accumulate orphans.
    const votes = await this.store.votesRepo.read();
    const remaining = votes.filter((vote) => vote.eventId !== params.event_id);
    if (remaining.length !== votes.length) await this.store.votesRepo.write(remaining);
    sendNoContent(res);
  }
}
