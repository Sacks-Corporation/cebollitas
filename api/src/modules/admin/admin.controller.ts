import { Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import archiver from 'archiver';
import type { Response } from 'express';
import { readdirSync } from 'node:fs';
import * as path from 'node:path';
import { CurrentUser, CurrentUserData } from '../../common/auth/current-user';
import { AdminOnly, Authenticated } from '../../common/auth/guards';
import { ValidateRequest, VBody, VParams } from '../../common/validation/request-validation';
import { BUNDLED_DATA_DIR } from '../../config/env';
import { RolesService } from '../../core/roles.service';
import { EventCreate, EventInput, serializeEvent } from '../events/events.schemas';
import { MonthParam } from '../monthly-events/monthly-events.controller';
import { MonthlyEventsService } from '../monthly-events/monthly-events.service';

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly roles: RolesService,
    private readonly monthly: MonthlyEventsService,
  ) {}

  @Get('me')
  @Authenticated()
  async adminMe(@CurrentUser() currentUser: CurrentUserData) {
    return { isAdmin: await this.roles.isAdmin(currentUser), email: currentUser.email };
  }

  /**
   * Zip of the bundled JSON data files. Like the Python version, this reads the
   * bundled data dir (not DATA_DIR, and not Mongo).
   */
  @Get('backup')
  @AdminOnly()
  backup(@Res() res: Response): void {
    const files = readdirSync(BUNDLED_DATA_DIR).filter((file) => file.endsWith('.json'));
    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=cebollitas-backup.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (error) => res.destroy(error));
    archive.pipe(res);
    for (const file of files) archive.file(path.join(BUNDLED_DATA_DIR, file), { name: file });
    void archive.finalize();
  }

  @Post('monthly-events/:month/event')
  @HttpCode(201)
  @AdminOnly()
  @ValidateRequest({ params: MonthParam, body: EventCreate })
  async adminCreateMonthlyEvent(
    @VParams() params: { month: number },
    @VBody() payload: EventInput,
    @CurrentUser() currentUser: CurrentUserData,
  ) {
    return serializeEvent(await this.monthly.createMonthlyEvent(params.month, payload, currentUser, false));
  }
}
