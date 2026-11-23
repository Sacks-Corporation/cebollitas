import { Controller, Get, HttpCode, Post, Put, UploadedFiles } from '@nestjs/common';
import { CurrentUser, CurrentUserData } from '../../common/auth/current-user';
import { Authenticated } from '../../common/auth/guards';
import { httpError } from '../../common/http-errors';
import { isoMonth, pyUtcNowIso } from '../../common/py-compat';
import { AcceptUploads, requireUploadedFile } from '../../common/upload';
import { pyInt, pyStr } from '../../common/validation/py-schema';
import { ValidateRequest, VBody, VParams } from '../../common/validation/request-validation';
import { ImageService } from '../../core/image.service';
import { RolesService } from '../../core/roles.service';
import { DataStoreService } from '../../persistence/data-store.service';
import { EventCreate, EventInput, EventUpdate, MIN_ATTENDEES_MSG, MIN_EVENT_ATTENDEES, serializeEvent } from '../events/events.schemas';
import { MonthlyEventsService } from './monthly-events.service';

export const MonthParam = { month: pyInt() };

@Controller('api/monthly-events')
@Authenticated()
export class MonthlyEventsController {
  constructor(
    private readonly store: DataStoreService,
    private readonly monthly: MonthlyEventsService,
    private readonly images: ImageService,
    private readonly roles: RolesService,
  ) {}

  @Get()
  async listMonthlyEvents() {
    const assignments = await this.store.monthlyAssignmentsRepo.read();
    const events = await this.store.eventsRepo.read();
    const cards = [];
    for (let month = 1; month <= 12; month++) {
      const event = events.find((item) => item.eventType === 'monthly_event' && isoMonth(item.date) === month);
      const key = String(month);
      cards.push({
        month,
        organizerName: key in assignments ? assignments[key] : 'Sin asignar',
        event: event ? serializeEvent(event) : null,
      });
    }
    return cards;
  }

  @Post('images')
  @HttpCode(200)
  @AcceptUploads()
  async uploadImage(@UploadedFiles() files: Express.Multer.File[]) {
    const file = requireUploadedFile(files);
    return { url: await this.images.saveUploadedImage(file) };
  }

  @Post(':month/event')
  @HttpCode(201)
  @ValidateRequest({ params: MonthParam, body: EventCreate })
  async createMonthlyEvent(
    @VParams() params: { month: number },
    @VBody() payload: EventInput,
    @CurrentUser() currentUser: CurrentUserData,
  ) {
    return serializeEvent(await this.monthly.createMonthlyEvent(params.month, payload, currentUser, true));
  }

  @Put(':event_id')
  @ValidateRequest({ params: { event_id: pyStr() }, body: EventUpdate })
  async updateMonthlyEvent(
    @VParams() params: { event_id: string },
    @VBody() payload: EventInput,
    @CurrentUser() currentUser: CurrentUserData,
  ) {
    if (payload.attendeeIds.length < MIN_EVENT_ATTENDEES) throw httpError(400, MIN_ATTENDEES_MSG);
    this.monthly.assertMonthlyPayloadComplete(payload);

    const events = await this.store.eventsRepo.read();
    const idx = events.findIndex((item) => item.id === params.event_id);
    if (idx === -1) throw httpError(404, 'Evento no encontrado.');
    const event = events[idx];
    if (event.eventType !== 'monthly_event') throw httpError(400, 'No es un evento del mes.');

    const assignedUser = await this.monthly.resolveAssignedOrganizer(isoMonth(event.date));
    const isCreator = event.creatorId === currentUser.id;
    const isAssigned = assignedUser !== undefined && assignedUser.id === currentUser.id;
    if (!(isCreator || isAssigned || (await this.roles.isAdmin(currentUser)))) {
      throw httpError(403, 'No tenés permisos para editar este evento.');
    }

    const updated = {
      ...payload,
      eventType: 'monthly_event',
      organizerId: assignedUser ? assignedUser.id : (event.organizerId ?? null),
      id: event.id,
      creatorId: event.creatorId,
      createdAt: event.createdAt,
      updatedAt: pyUtcNowIso(),
    };
    events[idx] = updated;
    await this.store.eventsRepo.write(events);
    return serializeEvent(updated);
  }
}
