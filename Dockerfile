# --- Stage 1: Build React Frontend ---
FROM node:20 AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Python Backend + Static Frontend ---
FROM python:3.11-slim AS backend

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend requirements
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend
COPY --from=frontend-build /app/frontend/build ./frontend/build

# Copy user and share data (if present)
COPY backend/config/users.json backend/config/share.json ./backend/config/
COPY backend/.env.example ./backend/

# Expose port (default 8000, can be overridden)
ENV PORT=8000
ENV SCAN_ROOT=/data

# Entrypoint
WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT"]
