#!/usr/bin/env bash
set -e

nginx -c "$PWD/nginx.conf" &
npm run start &
npm run start-socketio &

wait -n