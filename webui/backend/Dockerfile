FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    grep \
    && rm -rf /var/lib/apt/lists/*

# Copy backend files
COPY . /app/backend/

# Install Python dependencies
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Set working directory to backend
WORKDIR /app/backend

# Expose FastAPI port
EXPOSE 8000

# Run FastAPI application
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
