import { Controller, Delete, Get, HttpCode, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CurrentUser, CurrentUserData } from '../../common/auth/current-user';
import { RequireAllRoles } from '../../common/auth/guards';
import { httpError } from '../../common/http-errors';
import { sendNoContent } from '../../common/no-content';
import { pyUtcNowIso } from '../../common/py-compat';
import { pyStr } from '../../common/validation/py-schema';
import { ValidateRequest, VBody, VParams } from '../../common/validation/request-validation';
import { ROLE_CEBOLLITAS, ROLE_FUTBOL, RolesService } from '../../core/roles.service';
import { DataStoreService, Dict } from '../../persistence/data-store.service';
import {
  CebollitasMatchCreate,
  CebollitasMatchInput,
  CebollitasMatchUpdate,
  serializeCebollitasMatch,
} from './cebollitas-matches.schemas';
import { CebollitasMatchesService } from './cebollitas-matches.service';

const MatchIdParam = { match_id: pyStr() };

@Controller('api/cebollitas-matches')
@RequireAllRoles(ROLE_FUTBOL, ROLE_CEBOLLITAS)
export class CebollitasMatchesController {
  constructor(
    private readonly store: DataStoreService,
    private readonly service: CebollitasMatchesService,
    private readonly roles: RolesService,
  ) {}

  private async assertOrganizerIsFutbol(organizerId: string): Promise<void> {
    if (!(await this.service.isFutbolUser(organizerId))) {
      throw httpError(400, 'El organizador debe ser un usuario de fútbol.');
    }
  }

  private async assertCanManage(currentUser: CurrentUserData, match: Dict): Promise<void> {
    if (!(await this.roles.isAdmin(currentUser)) && match.creatorId !== currentUser.id) {
      throw httpError(403, 'Solo podés editar o eliminar los partidos que creaste.');
    }
  }

  @Get()
  async listMatches() {
    return (await this.service.listMatches()).map(serializeCebollitasMatch);
  }

  @Post()
  @HttpCode(201)
  @ValidateRequest({ body: CebollitasMatchCreate })
  async createMatch(@VBody() payload: CebollitasMatchInput, @CurrentUser() currentUser: CurrentUserData) {
    await this.assertOrganizerIsFutbol(payload.organizerId);
    const now = pyUtcNowIso();
    const match = {
      id: randomUUID(),
      date: payload.date,
      cancha: payload.cancha,
      team1: { ...payload.team1 },
      team2: { ...payload.team2 },
      winner: payload.winner,
      figura: payload.figura,
      organizerId: payload.organizerId,
      creatorId: currentUser.id,
      createdAt: now,
      updatedAt: now,
    };
    const matches = await this.store.cebollitasMatchesRepo.read();
    matches.push(match);
    await this.store.cebollitasMatchesRepo.write(matches);
    return serializeCebollitasMatch(await this.service.withOrganizerName(match));
  }

  @Put(':match_id')
  @ValidateRequest({ params: MatchIdParam, body: CebollitasMatchUpdate })
  async updateMatch(
    @VParams() params: { match_id: string },
    @VBody() payload: CebollitasMatchInput,
    @CurrentUser() currentUser: CurrentUserData,
  ) {
    await this.assertOrganizerIsFutbol(payload.organizerId);
    const matches = await this.store.cebollitasMatchesRepo.read();
    const match = matches.find((item) => item.id === params.match_id);
    if (!match) throw httpError(404, 'Partido no encontrado.');
    await this.assertCanManage(currentUser, match);
    Object.assign(match, {
      date: payload.date,
      cancha: payload.cancha,
      team1: { ...payload.team1 },
      team2: { ...payload.team2 },
      winner: payload.winner,
      figura: payload.figura,
      organizerId: payload.organizerId,
      updatedAt: pyUtcNowIso(),
    });
    await this.store.cebollitasMatchesRepo.write(matches);
    return serializeCebollitasMatch(await this.service.withOrganizerName(match));
  }

  @Delete(':match_id')
  @ValidateRequest({ params: MatchIdParam })
  async deleteMatch(
    @VParams() params: { match_id: string },
    @CurrentUser() currentUser: CurrentUserData,
    @Res() res: Response,
  ): Promise<void> {
    const matches = await this.store.cebollitasMatchesRepo.read();
    const idx = matches.findIndex((item) => item.id === params.match_id);
    if (idx === -1) throw httpError(404, 'Partido no encontrado.');
    await this.assertCanManage(currentUser, matches[idx]);
    matches.splice(idx, 1);
    await this.store.cebollitasMatchesRepo.write(matches);
    sendNoContent(res);
  }
}
