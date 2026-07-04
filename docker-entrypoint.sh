#!/bin/sh
set -eu

PORT="${PORT:-80}"
REDIRECT_HOST="${REDIRECT_HOST:-projekte.henrikheil.net}"
CANONICAL_HOST="${CANONICAL_HOST:-www.henrikheil.net}"
export PORT REDIRECT_HOST CANONICAL_HOST
envsubst '${PORT} ${REDIRECT_HOST} ${CANONICAL_HOST}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
