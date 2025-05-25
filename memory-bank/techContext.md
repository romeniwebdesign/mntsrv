# Technical Context

## Technologies Used
- **Backend:** Python 3, with dependencies managed via `requirements.txt`
- **Frontend:** React (JavaScript), with dependencies managed via `package.json`
- **Containerization:** Docker, with configuration in `Dockerfile` and `compose.yml`
- **Configuration:** Environment variables via `.env.example` and per-app `.env` files

## Development Setup
- Backend and frontend are developed in separate directories (`backend/`, `frontend/`)
- Local development can be run using Docker Compose for consistent multi-service orchestration
- Source code is version-controlled with Git, with `.gitignore` files in place for both frontend and backend
- Example environment files (`.env.example`) are provided to facilitate onboarding and secure configuration

## Technical Constraints
- The application is designed to run in a containerized environment for portability and reproducibility
- File system access is limited to the host or mounted volumes as configured in Docker
- User authentication and access control must be enforced at the backend API level
- The frontend must remain decoupled from backend implementation details, relying solely on documented APIs

## Dependencies
- **Backend:** Python packages as specified in `backend/requirements.txt` (e.g., Flask/FastAPI, file system libraries)
- **Frontend:** JavaScript packages as specified in `frontend/package.json` (e.g., React, Axios, UI libraries)
- **DevOps:** Docker, Docker Compose

## Tool Usage Patterns
- Use of Makefile (recommended) for common development tasks (build, test, run, lint)
- Environment variables for secrets and configuration, never hard-coded in source files
- Automated formatting and linting for both backend and frontend codebases
- Regular updates to documentation and memory bank to ensure project continuity
