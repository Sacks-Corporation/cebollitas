/**
 * Port of `services/cebollitas_service.py` (team matches).
 *
 * A separate collection from `matches`: each record is a team game (two teams,
 * a winner, a figura and an organizer). The only link to the rest of the app is
 * `organizerId`, which must be a FUTBOL allowed_user. Players and figura are
 * free text.
 */
import { Injectable } from '@nestjs/common';
import { pySorted } from '../../common/py-compat';
import { ROLE_FUTBOL } from '../../core/roles.service';
import { DataStoreService, Dict } from '../../persistence/data-store.service';

@Injectable()
export class CebollitasMatchesService {
  constructor(private readonly store: DataStoreService) {}

  async futbolUsers(): Promise<Dict[]> {
    return (await this.store.getAllowedUsers()).filter((user) => (user.roles ?? []).includes(ROLE_FUTBOL));
  }

  async isFutbolUser(userId: string): Promise<boolean> {
    return (await this.futbolUsers()).some((user) => user.id === userId);
  }

  private async nameById(): Promise<Map<string, string>> {
    return new Map((await this.store.getAllowedUsers()).map((user) => [user.id, user.name]));
  }

  /** Attach the organizer's current display name (resolved from allowed_users). */
  async withOrganizerName(match: Dict): Promise<Dict> {
    const names = await this.nameById();
    return { ...match, organizerName: names.get(match.organizerId) ?? '' };
  }

  /** All cebollitas matches, most recent first, with the organizer name resolved. */
  async listMatches(): Promise<Dict[]> {
    const names = await this.nameById();
    const matches = pySorted(await this.store.getCebollitasMatches(), (match) => [match.date ?? ''], true);
    return matches.map((match) => ({ ...match, organizerName: names.get(match.organizerId) ?? '' }));
  }
}
