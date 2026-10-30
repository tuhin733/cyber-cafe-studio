# Release

1. Update the version in `package.json` and refresh the lockfile:
   ```powershell
   npm install --package-lock-only
   ```
2. Run the checks:
   ```powershell
   npm ci
   npm run typecheck
   npm run lint
   npm test
   ```
3. Commit and push the version change to `main`.
4. Create and push a matching `v`-prefixed tag (for example, version `1.0.3` uses tag `v1.0.3`):
   ```powershell
   git tag v1.0.3
   git push origin v1.0.3
   ```
5. Check GitHub Actions and Releases. Confirm the release succeeded and includes `latest.yml` and the installer.

Pushing a `v*` tag starts the release workflow.
