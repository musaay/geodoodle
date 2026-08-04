# Stage 1: Build the frontend (Vite/Node)
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build the Go server
FROM golang:1.22-alpine AS go-builder
WORKDIR /app
COPY go.mod ./
COPY main.go ./
# Build a statically linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -o server main.go

# Stage 3: Final lightweight image
FROM alpine:latest
WORKDIR /app

# Copy the built Go binary
COPY --from=go-builder /app/server .
# Copy the built frontend dist folder
COPY --from=frontend-builder /app/dist ./dist

# Railway provides PORT automatically
ENV PORT=8080
EXPOSE $PORT

# Run the Go binary
CMD ["./server"]
