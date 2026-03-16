# Convention Speaker List

I built this to manage the speaker queue at national conventions -- the kind
where hundreds of delegates line up at microphones to ask questions or make
points, and someone needs to keep track of who's next, how long they've been
talking, and whether the demographics of the queue are representative.

It's a real-time web application: a React frontend and an Express backend,
connected via WebSockets so that everyone -- delegates, moderators, spectators
-- sees the same state at the same time.

## What it does

- Manages a digital queue for speakers across 2-4 microphone stations
- Tracks speaking time with built-in timers
- Optionally collects demographic data to help ensure balanced participation
- Provides an admin dashboard for moderators to control the queue
- Updates all connected clients in real time via Socket.io
- Works on mobile devices and handles offline scenarios with a service worker

## Getting it running

You'll need Node.js 18+ and Docker (for PostgreSQL and Redis in development).

```bash
npm install
cp .env.example .env    # then edit with your configuration
npm run docker:up       # start database and cache
npm run db:migrate      # run migrations
npm run dev             # start frontend and backend
```

The frontend runs at `http://localhost:5173`, the backend API at
`http://localhost:3001`.

## Project structure

This is an npm workspace with three packages:

- `frontend/` -- React 19 + TypeScript + Vite + Tailwind CSS
- `backend/` -- Express + TypeScript + SQLite + Socket.io
- `shared/` -- TypeScript types and utilities shared between the two

## Development commands

```bash
npm run dev             # start frontend and backend in dev mode
npm run build           # build everything for production
npm run test            # run all tests (Jest + Vitest)
npm run lint            # lint all code with ESLint
npm run format          # format with Prettier
npm run format:check    # check formatting without modifying
npm run typecheck       # type-check all packages without emitting
npm run test:coverage   # run tests with coverage reports
npm run test:fuzz       # run property-based tests with fast-check
```

## Using Nix

If you use Nix, `nix develop` drops you into a shell with everything you need:

```bash
nix develop
npm install
npm run dev
```

`nix flake check` runs the full verification suite -- formatting, linting,
type-checking, tests, and a clean build.

## Pre-commit hooks

The project uses [Lefthook](https://github.com/evilmartians/lefthook) for
pre-commit checks. After cloning:

```bash
lefthook install
```

This runs formatting checks, linting, type-checking, shell linting, and tests
in parallel before each commit.

## Docker

For production deployment:

```bash
docker-compose up -d
```

The `Dockerfile` builds both frontend and backend into a single image. See
`docker-compose.yml` for the full service configuration including PostgreSQL
and Redis.

## License

BSD 3-Clause. See [LICENSE.md](LICENSE.md).
