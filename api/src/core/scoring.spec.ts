import { computeRankings, sportsOrganizerBonus, TRIP_POINTS } from './scoring';

const byUser = (rows: ReturnType<typeof computeRankings>) => Object.fromEntries(rows.map((row) => [row.userId, row]));

describe('computeRankings', () => {
  it('awards trip points once per attendee', () => {
    const users = [
      { id: 'u1', name: 'A', email: 'a@a.com' },
      { id: 'u2', name: 'B', email: 'b@b.com' },
    ];
    const rows = byUser(computeRankings(users, [], [{ id: 't1', attendeeIds: ['u1', 'u2'] }]));
    expect(rows.u1.totalPoints).toBe(TRIP_POINTS);
    expect(rows.u2.totalPoints).toBe(TRIP_POINTS);
  });

  it('awards 30 for attendance and 40 for organizer', () => {
    const users = [
      { id: 'u1', name: 'A', email: 'a@a.com' },
      { id: 'u2', name: 'B', email: 'b@b.com' },
      { id: 'u3', name: 'C', email: 'c@c.com' },
    ];
    const events = [
      { id: 'e1', eventType: 'regular', attendeeIds: ['u1', 'u2'], organizerId: 'u1' },
      { id: 'e2', eventType: 'regular', attendeeIds: ['u2', 'u3'], organizerId: 'u2' },
    ];
    const rows = byUser(computeRankings(users, events));
    expect(rows.u1.totalPoints).toBe(40);
    expect(rows.u2.totalPoints).toBe(30 + 40);
    expect(rows.u3.totalPoints).toBe(30);
  });

  it('uses the vote average for the monthly event organizer', () => {
    const users = [
      { id: 'u1', name: 'A', email: 'a@a.com' },
      { id: 'u2', name: 'B', email: 'b@b.com' },
      { id: 'u3', name: 'C', email: 'c@c.com' },
    ];
    const events = [
      { id: 'e1', eventType: 'monthly_event', voteAverage: 7.0, attendeeIds: ['u1', 'u2', 'u3'], organizerId: 'u1' },
    ];
    const rows = byUser(computeRankings(users, events));
    expect(rows.u1.totalPoints).toBe(70);
    expect(rows.u2.totalPoints).toBe(40);
    expect(rows.u3.totalPoints).toBe(40);
  });

  it('prefers live vote averages over the stored one', () => {
    const users = [{ id: 'u1', name: 'A', email: 'a@a.com' }];
    const events = [{ id: 'e1', eventType: 'monthly_event', voteAverage: 2, attendeeIds: ['u1'], organizerId: 'u1' }];
    expect(computeRankings(users, events, [], { e1: 8.5 })[0].totalPoints).toBe(85);
  });

  it('ceils the organizer average', () => {
    const users = [{ id: 'u1', name: 'A', email: 'a@a.com' }];
    const events = [{ id: 'e1', eventType: 'monthly_event', voteAverage: 7.01, attendeeIds: ['u1'], organizerId: 'u1' }];
    expect(computeRankings(users, events)[0].totalPoints).toBe(71);
  });

  it('gives the organizer zero without a vote average', () => {
    const users = [{ id: 'u1', name: 'A', email: 'a@a.com' }];
    const events = [{ id: 'e1', eventType: 'monthly_event', attendeeIds: ['u1'], organizerId: 'u1' }];
    expect(computeRankings(users, events)[0].totalPoints).toBe(0);
  });

  it('awards 15 for extended events with no organizer bonus', () => {
    const users = [
      { id: 'u1', name: 'A', email: 'a@a.com' },
      { id: 'u2', name: 'B', email: 'b@b.com' },
    ];
    const events = [{ id: 'e1', eventType: 'extended', attendeeIds: ['u1', 'u2'], organizerId: 'u1' }];
    const rows = byUser(computeRankings(users, events));
    expect(rows.u1.totalPoints).toBe(15);
    expect(rows.u2.totalPoints).toBe(15);
  });

  it('sorts by total points desc', () => {
    const users = [
      { id: 'u1', name: 'A', email: 'a@a.com' },
      { id: 'u2', name: 'B', email: 'b@b.com' },
    ];
    const events = [
      { id: 'e1', attendeeIds: ['u1', 'u2'], organizerId: 'u1' },
      { id: 'e2', attendeeIds: ['u1'], organizerId: 'u1' },
    ];
    const rows = computeRankings(users, events);
    expect(rows[0]).toMatchObject({ userId: 'u1', totalPoints: 80 });
    expect(rows[1]).toMatchObject({ userId: 'u2', totalPoints: 30 });
  });

  it('keeps the original order for ties (stable, like Python)', () => {
    const users = ['a', 'b', 'c'].map((id) => ({ id, name: id }));
    expect(computeRankings(users, []).map((row) => row.userId)).toEqual(['a', 'b', 'c']);
  });

  it('computes attendance percentage and absences', () => {
    const users = [{ id: 'u1', name: 'A', email: 'a@a.com' }];
    const events = [
      { id: 'e1', attendeeIds: ['u1'], organizerId: null },
      { id: 'e2', attendeeIds: [], organizerId: null },
      { id: 'e3', attendeeIds: ['u1'], organizerId: null },
      { id: 'e4', attendeeIds: [], organizerId: null },
    ];
    const [row] = computeRankings(users, events);
    expect(row.attendancePercentage).toBe(50);
    expect(row.absences).toBe(2);
  });

  it('rounds attendance half to even like Python', () => {
    // 1/8 = 12.5% -> 12 with banker's rounding.
    const users = [{ id: 'u1', name: 'A' }];
    const events = Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, attendeeIds: i === 0 ? ['u1'] : [] }));
    expect(computeRankings(users, events)[0].attendancePercentage).toBe(12);
  });

  it('adds the sports organizer bonus every 10 cebollitas matches, capped at 3', () => {
    expect([0, 9, 10, 19, 20, 30, 45].map(sportsOrganizerBonus)).toEqual([0, 0, 40, 40, 80, 120, 120]);
    const users = [{ id: 'u1', name: 'A' }];
    const matches = Array.from({ length: 12 }, () => ({ organizerId: 'u1' }));
    expect(computeRankings(users, [], [], {}, matches)[0].totalPoints).toBe(40);
  });
});
