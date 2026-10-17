#!/usr/bin/env sh
# Copies the project website (site/) into the built app at dist/story/, adding the document head.
# The site is a plain static page; it is not part of the PWA and is not precached.
set -e
mkdir -p dist/story
cp -r site/img site/media dist/story/
{ printf '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<link rel="icon" href="../icon.svg" type="image/svg+xml">\n'; cat site/index.html; printf '\n</html>\n'; } > dist/story/index.html
echo "Site copied to dist/story/"
