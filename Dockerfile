FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home digilog && mkdir /data && chown digilog /data
COPY backend/digilog ./digilog
COPY --from=frontend /build/dist ./frontend
ENV DIGILOG_DB=/data/digilog.sqlite3 DIGILOG_FRONTEND=/app/frontend
USER digilog
EXPOSE 8000
CMD ["uvicorn", "digilog.main:app", "--host", "0.0.0.0", "--port", "8000"]
