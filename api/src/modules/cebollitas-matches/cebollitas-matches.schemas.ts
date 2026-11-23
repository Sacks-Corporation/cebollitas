import { z } from 'zod';
import { opt, serializeDate, serializeDatetime } from '../../common/serialize';
import { FieldError, pyDate, pyList, pyLiteral, pyModel, pyStr } from '../../common/validation/py-schema';
import { Dict } from '../../persistence/data-store.service';
import { validateMatchDate } from '../matches/matches.schemas';

export const CANCHAS = [5, 6, 7, 8, 11] as const;
export const WINNERS = ['team1', 'team2', 'draw'] as const;

// Allowed formations per cancha (players per team, goalkeeper included). The
// numbers are the outfield lines; the goalkeeper is always 1 at the back, so
// 1 + sum(parts) == cancha.
export const CANCHA_FORMATIONS: Record<number, string[]> = {
  5: ['2-2', '1-2-1', '3-1', '1-3'],
  6: ['2-1-2', '2-2-1', '1-2-2', '3-2'],
  7: ['2-3-1', '3-2-1', '2-2-2', '3-3'],
  8: ['3-3-1', '3-2-2', '2-3-2', '4-3'],
  11: ['4-4-2', '4-3-3', '3-5-2', '5-3-2', '4-5-1'],
};

const CebollitasTeam = pyModel({ formation: pyStr(), players: pyList(pyStr()) }, { name: 'CebollitasTeam' });

const baseShape = {
  date: pyDate(),
  cancha: pyLiteral(CANCHAS),
  team1: CebollitasTeam,
  team2: CebollitasTeam,
  winner: pyLiteral(WINNERS),
  figura: pyStr({ maxLength: 200, nullable: true, default: null }),
  organizerId: pyStr(),
};

type BaseModel = { [K in keyof typeof baseShape]: z.output<(typeof baseShape)[K]> };

/**
 * Each team's formation must be valid for the cancha and have exactly that
 * many non-empty players (trimmed). Only enforced on create/update, not on read.
 */
function validateTeams(model: BaseModel): BaseModel {
  const allowed = CANCHA_FORMATIONS[model.cancha] ?? [];
  for (const [label, team] of [
    ['Equipo 1', model.team1],
    ['Equipo 2', model.team2],
  ] as const) {
    if (!allowed.includes(team.formation)) {
      throw new FieldError(`Formación inválida para cancha de ${model.cancha} (${label}).`);
    }
    const names = team.players.map((player) => player.trim());
    if (names.length !== model.cancha || names.some((name) => !name)) {
      throw new FieldError(`${label} debe tener ${model.cancha} jugadores sin vacíos.`);
    }
    team.players = names;
  }
  return model;
}

const writeModel = (name: string) =>
  pyModel(baseShape, {
    name,
    fieldValidators: { date: validateMatchDate },
    after: [validateTeams],
  });

export const CebollitasMatchCreate = writeModel('CebollitasMatchCreate');
export const CebollitasMatchUpdate = writeModel('CebollitasMatchUpdate');
export type CebollitasMatchInput = BaseModel;

const serializeTeam = (team: Dict) => ({ formation: team.formation, players: team.players });

/** `CebollitasMatch` response model. */
export function serializeCebollitasMatch(match: Dict) {
  return {
    date: serializeDate(match.date),
    cancha: match.cancha,
    team1: serializeTeam(match.team1),
    team2: serializeTeam(match.team2),
    winner: match.winner,
    figura: opt(match.figura),
    organizerId: match.organizerId,
    id: match.id,
    organizerName: match.organizerName,
    creatorId: match.creatorId,
    createdAt: serializeDatetime(match.createdAt),
    updatedAt: serializeDatetime(match.updatedAt),
  };
}
