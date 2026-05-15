# =============================================================================
# Detypo PDF Proofreader — Docker image
# =============================================================================
# Build:
#   docker build -t detypo .
#
# Run:
#   docker run -p 3000:3000 detypo
#
# With custom API key:
#   docker run -p 3000:3000 -e DEEPSEEK_API_KEY=sk-xxx detypo
# =============================================================================

# ─── Stage 1: Build frontend ───
FROM node:22-alpine AS frontend-builder

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --silent

COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Python runtime ───
FROM python:3.13-slim

WORKDIR /app

# Install system deps for PyMuPDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY server.py ./
COPY core/ ./core/
COPY utils/ ./utils/
COPY rules/ ./rules/
COPY tokenizer/ ./tokenizer/
COPY static/ ./static/

# Copy built frontend from stage 1
COPY --from=frontend-builder /build/dist ./frontend/dist/

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 3000

ENV DETYPO_PROD=1
ENV HOST=0.0.0.0

CMD ["python", "server.py"]
