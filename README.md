# TaskFlow

**A microservices-based productivity and social collaboration
platform.**

TaskFlow brings task management, note sharing, and community features
together in one application. Its architecture separates core
capabilities into independently managed services, with an API Gateway
providing a unified entry point for the frontend.

> **Project status:** Under active development. Features and service
> integrations may be incomplete or change as development progresses.
> Check the implementation and test status before relying on any feature
> in production.

------------------------------------------------------------------------

## Table of Contents

-   [Overview](#overview)
-   [Planned Features](#planned-features)
-   [Architecture](#architecture)
-   [Technology Stack](#technology-stack)
-   [Repository Structure](#repository-structure)
-   [Prerequisites](#prerequisites)
-   [Getting Started](#getting-started)
-   [Environment Configuration](#environment-configuration)
-   [Running with Docker Compose](#running-with-docker-compose)
-   [Development Workflow](#development-workflow)
-   [API Design](#api-design)
-   [Security and Privacy](#security-and-privacy)
-   [Testing](#testing)
-   [Troubleshooting](#troubleshooting)
-   [Roadmap](#roadmap)
-   [Contributing](#contributing)
-   [License](#license)

------------------------------------------------------------------------

## Overview

TaskFlow is designed as a modular platform with separate services for
users, tasks, notes, social interactions, and notifications.

The project aims to provide:

-   A central place to manage personal tasks.
-   A notes workspace for creating and sharing information.
-   Public profiles and user discovery.
-   Social interactions around public notes.
-   Notifications for relevant activity.
-   An architecture that can be developed and scaled service by service.

The frontend communicates with backend services through the **API
Gateway** rather than calling individual microservices directly.

## Planned Features

The following describes the intended product scope. It does not imply
that every feature is already implemented or fully tested.

### Productivity

-   User registration and login.
-   Task creation, viewing, editing, and completion.
-   Notes creation and management.
-   Public and private note visibility.
-   File attachments for notes, subject to authorization.

### Social collaboration

-   Public user profiles.
-   User discovery and search.
-   Follow and unfollow users.
-   Followers and following lists with privacy controls.
-   Explore public notes.
-   Like and rate public notes.
-   Creator popularity scores and levels.
-   A social feed and popular creators view.

### Notifications

-   In-app notifications.
-   Follow and note-engagement notifications.
-   Read/unread notification status.

### Administration

-   An administrative dashboard for authorized user-management
    operations.
-   Appropriate moderation capabilities.
-   Administrative access must not bypass private-note or
    private-attachment protections.

------------------------------------------------------------------------

## Architecture

TaskFlow follows a microservices-oriented architecture.

``` text
                    ┌────────────────────────┐
                    │     React Frontend     │
                    │       (Vite)           │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │       API Gateway      │
                    │        Port 3000       │
                    └───────────┬────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
 ┌────────────────┐   ┌────────────────┐   ┌────────────────┐
 │  User Service  │   │  Task Service  │   │ Notification   │
 │   Port 3001    │   │   Port 3002    │   │ Service 3003   │
 └───────┬────────┘   └───────┬────────┘   └───────┬────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   User Database         Task Database       Notification DB

          ┌─────────────────────┴─────────────────────┐
          │                                           │
          ▼                                           ▼
 ┌────────────────┐                         ┌────────────────┐
 │  Notes Service │                         │ Social Service │
 │   Port 3004    │                         │   Port 3005    │
 └───────┬────────┘                         └───────┬────────┘
         │                                          │
         ▼                                          ▼
   Notes Database                             Social Database

                    ┌────────────────────────┐
                    │       RabbitMQ         │
                    │  Asynchronous Events   │
                    └────────────────────────┘
```

The diagram is a logical overview. Actual routing, database names, and
event flows should be confirmed against the current Docker Compose and
service configuration.

### Services

  ------------------------------------------------------------------------
  Component             Responsibility                          Local port
  --------------------- --------------------- ----------------------------
  API Gateway           Frontend entry point                          3000
                        and request routing   

  User Service          Authentication and                            3001
                        user profile data     

  Task Service          Task management                               3002

  Notification Service  In-app notifications                          3003

  Notes Service         Notes, visibility,                            3004
                        likes, ratings, and   
                        attachments           

  Social Service        Follow relationships,                         3005
                        discovery, and social 
                        aggregates            

  RabbitMQ              Asynchronous service       Configuration-dependent
                        communication         
  ------------------------------------------------------------------------

### Communication principles

-   **REST APIs** are used for synchronous requests.
-   **RabbitMQ** is used for asynchronous events where appropriate.
-   Each service owns its database.
-   Services must not directly read or write another service's database.
-   The frontend uses the API Gateway as its backend entry point.

------------------------------------------------------------------------

## Technology Stack

  Area              Technology
  ----------------- ----------------------------
  Frontend          React 19
  Build tool        Vite
  Styling           Tailwind CSS v4
  Routing           React Router v7
  HTTP client       Axios
  Backend           Node.js, Express
  Database          PostgreSQL
  ORM               Prisma
  Authentication    JWT and bcrypt
  Messaging         RabbitMQ
  Containers        Docker and Docker Compose
  API testing       Postman (development tool)
  Version control   Git and GitHub

Some versions and dependencies may differ between services. Refer to
each service's `package.json` and lockfile for the exact installed
versions.

------------------------------------------------------------------------

## Repository Structure

The repository is organized around separate backend services and a
frontend application. The structure below is representative; use the
actual repository tree as the source of truth.

``` text
taskflow/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── context/
│   │   ├── services/
│   │   └── ...
│   └── package.json
│
├── services/
│   ├── user-service/
│   ├── task-service/
│   ├── notification-service/
│   ├── notes-service/
│   └── social-service/
│
├── api-gateway/
├── docker-compose.yml
└── README.md
```

Each service may contain its own source code, Prisma schema, migrations,
tests, and package configuration.

------------------------------------------------------------------------

## Prerequisites

Install the following tools before running the project:

-   [Node.js](https://nodejs.org/) --- use the version compatible with
    the repository.
-   npm --- included with Node.js.
-   [Docker Engine](https://docs.docker.com/engine/) and [Docker
    Compose](https://docs.docker.com/compose/).
-   Git.
-   A code editor such as Visual Studio Code.

Check your installations:

``` bash
node --version
npm --version
git --version
docker --version
docker compose version
```

------------------------------------------------------------------------

## Getting Started

### 1. Clone the repository

``` bash
git clone https://github.com/Muzaffar0123/taskflow-microservices.git
cd taskflow-microservices
```

### 2. Inspect the project

Before installing dependencies, inspect the available folders and
package files:

``` bash
find . -maxdepth 3 -name package.json -o -name docker-compose.yml
```

### 3. Configure environment variables

Each service may require its own environment configuration. Review the
example environment files and service documentation.

If an example file exists, copy it without overwriting an existing local
configuration:

``` bash
cp .env.example .env
```

Only run this command if the repository contains a root `.env.example`.
Repeat for service-specific examples as required.

Fill in the required values locally. Do not commit `.env` files or
publish credentials.

### 4. Install dependencies

Install dependencies in the frontend, gateway, and each service
directory that contains a `package.json`:

``` bash
cd frontend
npm install
```

Then return to the repository root and install dependencies in the
relevant backend directories:

``` bash
cd ..
cd api-gateway
npm install
```

Repeat for each service that contains a `package.json`.

------------------------------------------------------------------------

## Environment Configuration

Configuration names vary by service. Inspect the code and example
environment files to determine the exact required variables.

Common configuration categories include:

  -----------------------------------------------------------------------
  Category                            Purpose
  ----------------------------------- -----------------------------------
  Port                                HTTP port for a service

  Database URL                        Connection to that service's
                                      PostgreSQL database

  JWT configuration                   Token verification/signing
                                      configuration

  Gateway service URLs                Internal service addresses used by
                                      the gateway

  RabbitMQ URL                        Message broker connection

  Object storage                      Private file storage configuration,
                                      if enabled

  Frontend API URL                    API Gateway address used by the
                                      frontend
  -----------------------------------------------------------------------

Example placeholders only:

``` env
PORT=3001
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

These are illustrative values, not guaranteed variable names or working
credentials. Confirm the exact names and formats in the existing service
configuration.

**Never commit secrets, production credentials, access tokens, private
keys, or real passwords.**

------------------------------------------------------------------------

## Running with Docker Compose

From the repository root, validate the Compose configuration:

``` bash
docker compose config
```

Build and start the configured services:

``` bash
docker compose up --build -d
```

Check running containers:

``` bash
docker compose ps
```

View logs:

``` bash
docker compose logs -f
```

View logs for a specific service:

``` bash
docker compose logs -f api-gateway
docker compose logs -f user-service
docker compose logs -f task-service
docker compose logs -f notification-service
docker compose logs -f notes-service
docker compose logs -f social-service
```

Stop the configured containers without deleting persistent database
volumes:

``` bash
docker compose down
```

Do not use `docker compose down -v` unless you intentionally want to
delete persistent volumes and understand the data-loss consequences.

------------------------------------------------------------------------

## Development Workflow

A practical development workflow:

1.  Pull the latest changes.
2.  Create a feature branch.
3.  Inspect the service and its existing patterns.
4.  Implement a small, focused change.
5.  Add or update tests.
6.  Run linting, tests, and builds.
7.  Review the Git diff.
8.  Commit the changes.

Example:

``` bash
git checkout -b feature/your-feature-name
git status
git diff
```

Use the scripts defined in each `package.json`. To list available
scripts:

``` bash
npm run
```

Do not assume every service uses the same scripts.

------------------------------------------------------------------------

## API Design

The API Gateway is the frontend's entry point.

Typical API areas include:

  Area             Responsibility
  ---------------- -----------------------------------------------------
  Authentication   Registration, login, and session-related operations
  Users            Profiles and user settings
  Tasks            Task management
  Notes            Notes, visibility, and attachments
  Social           Follows, discovery, and social interactions
  Notifications    Notification retrieval and read status

The exact endpoint paths and request/response formats are defined by the
current backend implementation. Refer to the service route files or API
documentation rather than assuming example routes are available.

------------------------------------------------------------------------

## Security and Privacy

Security is a core requirement for TaskFlow.

-   Protect private routes with authentication and authorization.
-   Validate incoming data on the backend.
-   Store passwords using secure password hashing.
-   Keep secrets in environment variables or a suitable secret manager.
-   Do not expose internal service credentials to the frontend.
-   Enforce note visibility on every relevant API request.
-   Check ownership and permissions before serving attachments.
-   Keep private object storage private.
-   Apply follower/following visibility rules on the backend.
-   Do not allow clients to set trusted engagement totals or popularity
    scores.
-   Ensure administrative access does not automatically grant access to
    private notes or private attachments.

------------------------------------------------------------------------

## Testing

Use the testing framework and scripts already configured in each
package.

List available scripts:

``` bash
npm run
```

Run the relevant test command from the appropriate project directory.
For example, if a package defines a `test` script:

``` bash
npm test
```

Frontend quality checks may include:

``` bash
npm run lint
npm run build
```

These commands are available only if the corresponding scripts are
defined in that package.

Before considering a feature complete, verify:

-   Its API endpoint exists.
-   Authentication and authorization work.
-   Database changes are migrated safely.
-   The frontend handles loading, success, empty, and error states.
-   Automated tests pass.
-   Existing features still work.

------------------------------------------------------------------------

## Troubleshooting

### Route not found (404)

Check:

1.  The frontend route exists.
2.  The navigation link uses the correct path.
3.  The API Gateway route is registered.
4.  The target microservice route is mounted.
5.  The HTTP method and URL match.

A frontend page route and a backend API route are different things;
check both.

### API request fails

Check:

-   The API Gateway is running.
-   The requested service is running.
-   The frontend uses the correct Gateway base URL.
-   The request method, path, headers, and body are correct.
-   Authentication tokens are valid.
-   The service logs contain the corresponding request or error.

### Database connection or Prisma error

Check:

-   The service's database is running.
-   Its database URL is configured correctly.
-   Required migrations have been applied.
-   The Prisma client has been generated when required by the service
    setup.

Use the service's existing Prisma scripts and migration workflow. Do not
reset a database to resolve an unknown error.

### Container is unhealthy or exits

Inspect:

``` bash
docker compose ps
docker compose logs --tail=100 SERVICE_NAME
```

Replace `SERVICE_NAME` with the actual Compose service name.

------------------------------------------------------------------------

## Roadmap

The roadmap reflects the intended direction of the project. Completion
status should be updated as features are implemented and tested.

-   [ ] Stabilize frontend routing and navigation.
-   [ ] Verify API Gateway and microservice integration.
-   [ ] Complete authentication and protected routes.
-   [ ] Complete task management workflows.
-   [ ] Complete notes management and attachment permissions.
-   [ ] Complete public user profiles.
-   [ ] Complete follow/unfollow functionality.
-   [ ] Add privacy controls for followers and following lists.
-   [ ] Complete public notes discovery.
-   [ ] Complete likes and ratings.
-   [ ] Implement event-driven creator popularity.
-   [ ] Complete social notifications.
-   [ ] Complete social feed and popular creators.
-   [ ] Complete admin dashboard workflows.
-   [ ] Add comprehensive integration and security tests.
-   [ ] Improve deployment documentation and production readiness.

------------------------------------------------------------------------

## Contributing

Contributions and suggestions are welcome.

1.  Fork the repository.
2.  Create a feature branch.
3.  Make focused changes.
4.  Add or update tests.
5.  Run the relevant checks.
6.  Submit a pull request describing the change.

Please avoid committing secrets, generated build output, local database
files, or personal environment configuration.

------------------------------------------------------------------------

## License

No license has been specified yet.

Until a license is added to the repository, all rights remain with the
copyright holder. If you intend to make TaskFlow open source, add an
appropriate `LICENSE` file and update this section.

------------------------------------------------------------------------

## Author

**Muzaffar Ali**

GitHub: [@Muzaffar0123](https://github.com/Muzaffar0123)

Repository: [TaskFlow ---
Microservices](https://github.com/Muzaffar0123/taskflow-microservices)

------------------------------------------------------------------------

```{=html}
<p align="center">
```
Built with ❤️ as a learning and software engineering project.
```{=html}
</p>
```
# task-and-notes-manager
