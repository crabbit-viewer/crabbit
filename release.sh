#!/bin/bash
set -e

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Usage: ./release.sh v0.5.0"
  exit 1
fi

if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must match vX.Y.Z (e.g. v0.5.0)"
  exit 1
fi

# Strip the leading 'v' for package.json (v0.13.0 -> 0.13.0)
SEMVER="${VERSION#v}"

# Update package.json version to match the release tag
CURRENT_VERSION=$(node -p "require('./package.json').version")
if [ "$CURRENT_VERSION" != "$SEMVER" ]; then
  npm version "$SEMVER" --no-git-tag-version
  git add package.json
  git commit -m "Bump version to $SEMVER"
fi

git tag "$VERSION"
git push origin main
git push origin "$VERSION"

echo "Tagged and pushed $VERSION — GitHub Actions will build the release."
