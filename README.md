# Convention Speaker List Manager

A real-time queue management system for handling speaker questions at conventions, built with modern web technologies.

## Project Overview

The Convention Speaker List Manager is designed to streamline the Q&A process at conventions by providing a digital queue system for audience members who want to ask questions. The system supports multiple microphones, tracks speaker demographics, and provides real-time updates to all participants.

## Tech Stack

- **Frontend**: React 18+ with TypeScript, Vite
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL
- **Cache**: Redis
- **Real-time**: Socket.io
- **Containerization**: Docker & Docker Compose

## Project Structure

```
convention-speaker-list/
├── frontend/          # React frontend application
│   ├── src/          # Source code
│   ├── public/       # Static assets
│   └── package.json  # Frontend dependencies
├── backend/          # Express backend server
│   ├── src/          # Source code
│   ├── tests/        # Test files
│   └── package.json  # Backend dependencies
├── shared/           # Shared TypeScript types and utilities
│   ├── src/          # Shared code
│   └── package.json  # Shared dependencies
├── database/         # Database scripts and migrations
│   ├── migrations/   # SQL migration files
│   └── seeds/        # Seed data
├── docker/           # Docker configuration files
│   └── ...          # Environment-specific configs
├── docker-compose.yml     # Docker Compose configuration
├── package.json          # Root workspace configuration
├── tsconfig.json         # TypeScript configuration
├── .eslintrc.js         # ESLint configuration
├── prettier.config.js    # Prettier configuration
└── .editorconfig        # Editor configuration
```

## Features

- **Queue Management**: Digital queue system for managing speaker questions
- **Multiple Microphones**: Support for 2-4 microphone stations
- **Real-time Updates**: WebSocket-based live updates for all users
- **Demographics Tracking**: Optional demographic data collection
- **Timer System**: Built-in timer for managing speaking time
- **Admin Dashboard**: Comprehensive admin interface for queue management
- **Offline Support**: Service worker for offline functionality
- **Mobile Responsive**: Full mobile device support

## Getting Started

### Prerequisites

- Node.js 18+ and npm 9+
- Docker and Docker Compose
- PostgreSQL 14+ (via Docker)
- Redis (via Docker)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/convention-speaker-list.git
cd convention-speaker-list
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start Docker services:
```bash
npm run docker:up
```

5. Run database migrations:
```bash
npm run db:migrate
```

6. Start development servers:
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- WebSocket: ws://localhost:3000

## Development

### Available Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run build` - Build all packages for production
- `npm run test` - Run tests across all packages
- `npm run lint` - Lint all packages
- `npm run format` - Format code with Prettier
- `npm run docker:up` - Start Docker services
- `npm run docker:down` - Stop Docker services
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with sample data

### Workspace Commands

Run commands in specific workspaces:
```bash
npm run dev --workspace=frontend
npm run build --workspace=backend
npm run test --workspace=shared
```

## Testing

The project uses Jest for unit testing and Cypress for E2E testing:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e
```

## Deployment

### Production Build

```bash
# Build all packages
npm run build

# The built files will be in:
# - frontend/dist
# - backend/dist
# - shared/dist
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions, please use the GitHub issues page.