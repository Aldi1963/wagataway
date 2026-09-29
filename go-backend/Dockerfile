# ── Build stage ─────────────────────────────────────────────────────────
FROM golang:1.26-alpine AS builder

RUN apk add --no-cache git gcc musl-dev

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

# ── Frontend build stage ───────────────────────────────────────────────
FROM node:22-alpine AS frontend

WORKDIR /app/web

COPY web/package.json web/pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --no-frozen-lockfile

COPY web/ ./
RUN pnpm build

# ── Production stage ───────────────────────────────────────────────────
FROM alpine:3.20

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

COPY --from=builder /server .
COPY --from=frontend /app/web/dist ./web/dist

RUN mkdir -p /app/wa-sessions /app/public/uploads

EXPOSE 8080

CMD ["./server"]
