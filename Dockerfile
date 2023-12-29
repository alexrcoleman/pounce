# Create a node 18 image with npm, copy everything for simplicity, run "npm install" and "npm run build", then set the
# entrypoint to "npm start"
FROM node:18-alpine

RUN apk add --no-cache \
	nginx \
	bash

ENV TINI_VERSION v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-static /tini
RUN chmod +x /tini

WORKDIR /app

COPY . .

RUN npm install && npm run build && npm run build-socketio
RUN ["chmod", "+x", "/app/start.sh"]

EXPOSE 8080

ENTRYPOINT ["/tini", "--", "./start.sh"]