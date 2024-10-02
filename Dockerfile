# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=18.20.4
FROM node:${NODE_VERSION} as base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base as build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git node-gyp pkg-config python-is-python3

# Install Go-based magic-wormhole for downloading volume content for local development.
RUN curl -fsSL -o /usr/local/bin/wormhole https://github.com/psanford/wormhole-william/releases/download/v1.0.6/wormhole-william-linux-amd64 && chmod +x /usr/local/bin/wormhole

# Install node modules
COPY --link package-lock.json package.json ./
RUN npm ci

# Copy application code
COPY --link . .


# Final stage for app image
FROM base

# Copy built application
COPY --from=build /app /app
COPY --from=build /usr/local/bin/wormhole /usr/local/bin/wormhole

# Setup sqlite3 on a separate volume
RUN mkdir -p /data
VOLUME /data

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
ENV DATABASE_URL="file:///data/sqlite.db"
CMD [ "npm", "run", "start" ]
