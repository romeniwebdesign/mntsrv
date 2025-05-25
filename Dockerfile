# --- Stage 1: Build React Frontend ---
FROM node:20 AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Python Backend + Static Frontend ---
FROM python:3.11-slim AS backend

ARG APP_UID=1000
ARG APP_GID=1000

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --gid $APP_GID appgroup \
 && adduser --uid $APP_UID --gid $APP_GID --disabled-password --gecos "" appuser

WORKDIR /app

# Backend requirements
COPY --chown=appuser:appgroup backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code (including config and .env.example)
COPY --chown=appuser:appgroup backend/ ./backend/

# Copy built frontend
COPY --from=frontend-build /app/frontend/build ./frontend/build

# Final ownership fix
RUN chown -R appuser:appgroup /app

# Expose port (default 8000, can be overridden)
ENV PORT=8000
ENV SCAN_ROOT=/data

# Use non-root user
USER appuser

# Entrypoint
WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT"]
