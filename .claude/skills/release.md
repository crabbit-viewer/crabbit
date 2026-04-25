---
name: release
description: Bump version, tag, and push a new release to GitHub
argument-hint: "[major|minor|patch]"
allowed-tools:
  - Bash(git *)
  - Edit
  - Read
---

Release a new version of Crabbit to GitHub.

## Arguments

$ARGUMENTS — optional: `major`, `minor`, or `patch` to control which part to increment. Defaults to `minor`.

## Instructions

1. **Read the current version** from `package.json` (`"version"` field). Parse it into major, minor, and patch numbers.

2. **Determine the new version.** Based on the argument (default `minor`):
   - `major` — increment major, reset minor and patch to 0 (e.g. `0.15.0` -> `1.0.0`)
   - `minor` — increment minor, reset patch to 0 (e.g. `0.15.0` -> `0.16.0`)
   - `patch` — increment patch (e.g. `0.15.0` -> `0.15.1`)

   The tag is `v<new version>` (e.g. `v0.16.0`).

3. **Check preconditions:**
   - Run `git status` to ensure the working tree is clean (no uncommitted changes). If dirty, stop and tell the user.
   - Check that the tag doesn't already exist (`git tag -l <tag>`). If it does, stop and tell the user.

4. **Bump the version in `package.json`.** Update only the `"version"` field to the new semver string. Do not modify anything else.

5. **Commit the version bump.** Stage only `package.json` and commit with the message `Bump version to <semver>` (e.g. `Bump version to 0.16.0`).

6. **Create the git tag.** Run `git tag <tag>`.

7. **Push to GitHub.** Run `git push origin main && git push origin <tag>`. This triggers GitHub Actions to build the release.

8. **Confirm success.** Tell the user: the old version, the new version, and that GitHub Actions will build the release.
