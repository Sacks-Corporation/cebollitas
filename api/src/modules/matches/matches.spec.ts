import { CebollitasMatchCreate } from '../cebollitas-matches/cebollitas-matches.schemas';
import { countWorldCups } from './matches.service';

describe('countWorldCups', () => {
  const W = 'win';
  const D = 'draw';
  const L = 'loss';

  it('counts a group stage >= 4 points followed by 4 straight wins', () => {
    expect(countWorldCups([W, D, L, W, W, W, W])).toBe(1);
  });

  it('resets on a second group-stage loss', () => {
    // Values cross-checked against the Python _count_world_cups.
    expect(countWorldCups([W, L, L, W, W, W, W])).toBe(0);
    expect(countWorldCups([W, L, L, W, W, W, W, W, W, W])).toBe(1);
    expect(countWorldCups([L, L, W, D, W, W, W, W, W])).toBe(1);
  });

  it('resets when the group stage ends under 4 points', () => {
    expect(countWorldCups([W, L, D, W, W, W, W])).toBe(1); // 4 points is enough
    expect(countWorldCups([D, D, L, W, W, W, W])).toBe(0);
  });

  it('resets on any non-win in the knockout phase', () => {
    expect(countWorldCups([W, W, W, W, W, D, W])).toBe(0);
  });

  it('counts consecutive cups', () => {
    expect(countWorldCups(Array(14).fill(W))).toBe(2);
  });
});

describe('CebollitasMatchCreate', () => {
  const today = new Date().toISOString().slice(0, 10);
  const team = (n: number, formation: string) => ({ formation, players: Array.from({ length: n }, (_, i) => ` P${i} `) });
  const body = (overrides: Record<string, unknown> = {}) => ({
    date: today,
    cancha: 5,
    team1: team(5, '2-2'),
    team2: team(5, '3-1'),
    winner: 'draw',
    organizerId: 'u1',
    ...overrides,
  });

  it('trims players and defaults figura to null', () => {
    const result = CebollitasMatchCreate.safeParse(body());
    expect(result.success && result.data.team1.players[0]).toBe('P0');
    expect(result.success && result.data.figura).toBeNull();
  });

  it('rejects formations that do not fit the cancha', () => {
    const result = CebollitasMatchCreate.safeParse(body({ team2: team(5, '4-4-2') }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('Value error, Formación inválida para cancha de 5 (Equipo 2).');
  });

  it('rejects a wrong number of players', () => {
    const result = CebollitasMatchCreate.safeParse(body({ team1: { formation: '2-2', players: ['a', 'b', 'c', 'd', ' '] } }));
    expect(result.error?.issues[0].message).toBe('Value error, Equipo 1 debe tener 5 jugadores sin vacíos.');
  });
});
