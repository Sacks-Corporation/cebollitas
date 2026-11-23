import { Controller, Delete, Get, HttpCode, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CurrentUser, CurrentUserData } from '../../common/auth/current-user';
import { RequireRoles } from '../../common/auth/guards';
import { httpError } from '../../common/http-errors';
import { sendNoContent } from '../../common/no-content';
import { pyStr } from '../../common/validation/py-schema';
import { ValidateRequest, VBody, VParams } from '../../common/validation/request-validation';
import { ROLE_FUTBOL, RolesService } from '../../core/roles.service';
import { DataStoreService, Dict } from '../../persistence/data-store.service';
import {
  MatchCreate,
  MatchCreateInput,
  MatchUpdate,
  MatchUpdateInput,
  serializeMatch,
  serializePlayerStats,
  serializeWorldCups,
} from './matches.schemas';
import { MatchesService } from './matches.service';

const MatchIdParam = { match_id: pyStr() };

@Controller('api')
export class MatchesController {
  constructor(
    private readonly store: DataStoreService,
    private readonly matches: MatchesService,
    private readonly roles: RolesService,
  ) {}

  /**
   * Non-admins can only create matches for themselves (any requested userId is
   * ignored). Admins may target a FUTBOL user; null means "for myself".
   */
  private async resolveTargetUserId(currentUser: CurrentUserData, requestedUserId: string | null): Promise<string> {
    if (!(await this.roles.isAdmin(currentUser))) return currentUser.id;
    if (!requestedUserId) return currentUser.id;
    const target = (await this.store.getAllowedUsers()).find((user) => user.id === requestedUserId);
    if (!target || !(target.roles ?? []).includes(ROLE_FUTBOL)) {
      throw httpError(400, 'El jugador seleccionado no es un usuario de fútbol válido.');
    }
    return requestedUserId;
  }

  private async assertCanManage(currentUser: CurrentUserData, match: Dict, action: string): Promise<void> {
    if (!(await this.roles.isAdmin(currentUser)) && match.userId !== currentUser.id) {
      throw httpError(403, `Solo podés ${action} tus partidos.`);
    }
  }

  @Get('matches')
  @RequireRoles(ROLE_FUTBOL)
  async listMatches() {
    return (await this.matches.listMatches()).map(serializeMatch);
  }

  @Get('matches/stats')
  @RequireRoles(ROLE_FUTBOL)
  async listPlayerStats() {
    return (await this.matches.listPlayerStats()).map(serializePlayerStats);
  }

  @Get('matches/world-cups')
  @RequireRoles(ROLE_FUTBOL)
  async listWorldCups() {
    return (await this.matches.listWorldCups()).map(serializeWorldCups);
  }

  @Post('matches')
  @HttpCode(201)
  @RequireRoles(ROLE_FUTBOL)
  @ValidateRequest({ body: MatchCreate })
  async createMatch(@VBody() payload: MatchCreateInput, @CurrentUser() currentUser: CurrentUserData) {
    const match = {
      id: randomUUID(),
      userId: await this.resolveTargetUserId(currentUser, payload.userId),
      date: payload.date,
      result: payload.result,
      goals: payload.goals,
      stadium: payload.stadium,
    };
    const matches = await this.store.matchesRepo.read();
    matches.push(match);
    await this.store.matchesRepo.write(matches);
    return serializeMatch(await this.matches.withPlayerName(match));
  }

  @Put('matches/:match_id')
  @RequireRoles(ROLE_FUTBOL)
  @ValidateRequest({ params: MatchIdParam, body: MatchUpdate })
  async updateMatch(
    @VParams() params: { match_id: string },
    @VBody() payload: MatchUpdateInput,
    @CurrentUser() currentUser: CurrentUserData,
  ) {
    const matches = await this.store.matchesRepo.read();
    const idx = matches.findIndex((match) => match.id === params.match_id);
    if (idx === -1) throw httpError(404, 'Partido no encontrado.');
    const match = matches[idx];
    await this.assertCanManage(currentUser, match, 'editar');
    // result and userId stay untouched — only goals/stadium/date are editable.
    match.goals = payload.goals;
    match.stadium = payload.stadium;
    match.date = payload.date;
    await this.store.matchesRepo.write(matches);
    return serializeMatch(await this.matches.withPlayerName(match));
  }

  @Delete('matches/:match_id')
  @RequireRoles(ROLE_FUTBOL)
  @ValidateRequest({ params: MatchIdParam })
  async deleteMatch(
    @VParams() params: { match_id: string },
    @CurrentUser() currentUser: CurrentUserData,
    @Res() res: Response,
  ): Promise<void> {
    const matches = await this.store.matchesRepo.read();
    const idx = matches.findIndex((match) => match.id === params.match_id);
    if (idx === -1) throw httpError(404, 'Partido no encontrado.');
    await this.assertCanManage(currentUser, matches[idx], 'eliminar');
    matches.splice(idx, 1);
    await this.store.matchesRepo.write(matches);
    sendNoContent(res);
  }
}
