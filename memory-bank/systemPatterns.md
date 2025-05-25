# System Patterns

## System Architecture
The project follows a client-server architecture with a clear separation between frontend and backend components:
- **Backend:** Python-based, responsible for file system operations, search, user authentication, sharing logic, and serving APIs.
- **Frontend:** React-based, responsible for user interface, state management, and communicating with the backend via HTTP APIs.

## Key Technical Decisions
- Use of Python for backend to leverage robust file system libraries and rapid API development.
- Use of React for frontend to provide a responsive, component-driven user experience.
- Docker-based deployment for consistent development and production environments.
- Environment variables managed via `.env.example` and per-app `.env` files for secure configuration.

## Design Patterns
- **Separation of Concerns:** Backend and frontend are developed and deployed independently, communicating only via well-defined APIs.
- **Modularization:** Backend logic is organized into separate modules for scanning, searching, sharing, and configuration.
- **Progress Reporting:** Backend provides endpoints for real-time progress updates, consumed by the frontend to display operation status.
- **State Lifting:** Frontend components lift state as needed to enable cross-component communication (e.g., search results, selected files).

## Component Relationships
- The frontend interacts with backend APIs for all file operations, search, and sharing.
- Backend modules interact with configuration files and the file system, enforcing user permissions and access control.
- Progress and status updates are communicated from backend to frontend for user feedback.

## Critical Implementation Paths
- **Authentication:** User login flow, session management, and access control for file operations.
- **File Browsing:** Directory listing, navigation, and file metadata retrieval.
- **Search:** Indexing and querying files/folders, returning results to the frontend.
- **Sharing:** Managing share links, permissions, and recipient notifications.
- **Progress Tracking:** Reporting and displaying progress for long-running operations (e.g., scanning, saving).
