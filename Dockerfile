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

ARG NEXT_PUBLIC_SITE_URL
ARG POUNCE_BUILD_STORYBOOK=false
ARG POUNCE_DEPLOY_ENV=production

ENV POUNCE_DEPLOY_ENV=${POUNCE_DEPLOY_ENV}
ENV STORYBOOK_DISABLE_TELEMETRY=1

RUN npm install && \
	if [ -f .pounce-build-env ]; then \
		set -a && . ./.pounce-build-env && set +a; \
	fi && \
	npm run build && \
	if [ "$POUNCE_BUILD_STORYBOOK" = "true" ]; then \
		npm run build-storybook -- --output-dir storybook-static --quiet && \
		mkdir -p public/stories && \
		cp -R storybook-static/. public/stories/; \
	fi && \
	npm run build-socketio
RUN ["chmod", "+x", "/app/start.sh"]

EXPOSE 8080

ENTRYPOINT ["/tini", "--", "./start.sh"]
