export type EventsFilters = {
  month?: string
  type?: string
  attendeeId?: string
}

export type TripsFilters = {
  month?: string
  attendeeId?: string
}

export const qk = {
  users: ['users'] as const,
  me: ['me'] as const,
  matches: ['matches'] as const,
  matchStats: ['matches', 'stats'] as const,
  matchWorldCups: ['matches', 'world-cups'] as const,
  cebollitasMatches: ['cebollitas-matches'] as const,
  rankings: ['rankings'] as const,
  events: {
    all: ['events'] as const,
    list: (filters: EventsFilters) => ['events', 'list', filters] as const,
    detail: (id: string) => ['events', 'detail', id] as const,
  },
  trips: {
    all: ['trips'] as const,
    lists: ['trips', 'list'] as const,
    list: (filters: TripsFilters) => ['trips', 'list', filters] as const,
    detail: (id: string) => ['trips', 'detail', id] as const,
  },
  monthlyEvents: {
    all: ['monthly-events'] as const,
    cards: ['monthly-events', 'cards'] as const,
  },
  votes: {
    hasVoted: (eventId: string) => ['votes', 'has-voted', eventId] as const,
    myVote: (eventId: string) => ['votes', 'my-vote', eventId] as const,
  },
  admin: {
    me: ['admin', 'me'] as const,
  },
}
