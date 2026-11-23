import { Controller, Delete, Get, HttpCode, Post, Put, Res, UploadedFiles } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CurrentUser, CurrentUserData } from '../../common/auth/current-user';
import { AdminOnly, Authenticated } from '../../common/auth/guards';
import { httpError } from '../../common/http-errors';
import { sendNoContent } from '../../common/no-content';
import { pySorted, pyUtcNowIso } from '../../common/py-compat';
import { AcceptUploads, requireUploadedFile } from '../../common/upload';
import { pyInt, pyStr } from '../../common/validation/py-schema';
import { ValidateRequest, VBody, VParams, VQuery } from '../../common/validation/request-validation';
import { ImageService, TRIPS_FOLDER } from '../../core/image.service';
import { RolesService } from '../../core/roles.service';
import { DataStoreService } from '../../persistence/data-store.service';
import { assertAttendees, tripCoversMonth } from './trips.rules';
import { serializeTrip, TripCreate, TripInput, TripUpdate } from './trips.schemas';

const TripIdParam = { trip_id: pyStr() };
const TripListQuery = {
  month: pyInt({ ge: 1, le: 12, nullable: true, default: null }),
  attendeeId: pyStr({ nullable: true, default: null }),
};

@Controller('api/trips')
export class TripsController {
  constructor(
    private readonly store: DataStoreService,
    private readonly images: ImageService,
    private readonly roles: RolesService,
  ) {}

  @Get()
  @Authenticated()
  @ValidateRequest({ query: TripListQuery })
  async listTrips(@VQuery() query: { month: number | null; attendeeId: string | null }) {
    let trips = await this.store.tripsRepo.read();
    if (query.month) trips = trips.filter((trip) => tripCoversMonth(trip, query.month!));
    if (query.attendeeId) trips = trips.filter((trip) => (trip.attendeeIds ?? []).includes(query.attendeeId));
    trips = pySorted(trips, (trip) => [trip.startDate, trip.createdAt ?? ''], true);
    return trips.map(serializeTrip);
  }

  @Post('images')
  @HttpCode(200)
  @Authenticated()
  @AcceptUploads()
  async uploadTripImage(@UploadedFiles() files: Express.Multer.File[]) {
    const file = requireUploadedFile(files);
    return { url: await this.images.saveUploadedImage(file, TRIPS_FOLDER) };
  }

  @Get(':trip_id')
  @Authenticated()
  @ValidateRequest({ params: TripIdParam })
  async getTrip(@VParams() params: { trip_id: string }) {
    const trip = (await this.store.tripsRepo.read()).find((item) => item.id === params.trip_id);
    if (!trip) throw httpError(404, 'Viaje no encontrado.');
    return serializeTrip(trip);
  }

  @Post()
  @HttpCode(201)
  @Authenticated()
  @ValidateRequest({ body: TripCreate })
  async createTrip(@VBody() payload: TripInput, @CurrentUser() currentUser: CurrentUserData) {
    assertAttendees(payload.attendeeIds, await this.store.getAllowedUsers());

    const now = pyUtcNowIso();
    const trip = { ...payload, id: randomUUID(), creatorId: currentUser.id, createdAt: now, updatedAt: now };

    const trips = await this.store.tripsRepo.read();
    trips.push(trip);
    await this.store.tripsRepo.write(trips);
    return serializeTrip(trip);
  }

  @Put(':trip_id')
  @Authenticated()
  @ValidateRequest({ params: TripIdParam, body: TripUpdate })
  async updateTrip(
    @VParams() params: { trip_id: string },
    @VBody() payload: TripInput,
    @CurrentUser() currentUser: CurrentUserData,
  ) {
    assertAttendees(payload.attendeeIds, await this.store.getAllowedUsers());

    const trips = await this.store.tripsRepo.read();
    const idx = trips.findIndex((item) => item.id === params.trip_id);
    if (idx === -1) throw httpError(404, 'Viaje no encontrado.');
    const trip = trips[idx];

    // Trips seeded before the ABM existed have no creator, so they are admin-only territory.
    const isCreator = Boolean(trip.creatorId) && trip.creatorId === currentUser.id;
    if (!(isCreator || (await this.roles.isAdmin(currentUser)))) {
      throw httpError(403, 'Solo podés editar tus viajes.');
    }

    const updated = {
      ...payload,
      id: trip.id,
      creatorId: trip.creatorId ?? null,
      createdAt: trip.createdAt,
      updatedAt: pyUtcNowIso(),
    };
    trips[idx] = updated;
    await this.store.tripsRepo.write(trips);
    return serializeTrip(updated);
  }

  @Delete(':trip_id')
  @AdminOnly()
  @ValidateRequest({ params: TripIdParam })
  async deleteTrip(@VParams() params: { trip_id: string }, @Res() res: Response): Promise<void> {
    const trips = await this.store.tripsRepo.read();
    const idx = trips.findIndex((item) => item.id === params.trip_id);
    if (idx === -1) throw httpError(404, 'Viaje no encontrado.');
    trips.splice(idx, 1);
    await this.store.tripsRepo.write(trips);
    sendNoContent(res);
  }
}
