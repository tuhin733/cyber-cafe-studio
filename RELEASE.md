# Release Steps

1. **Update version** in `package.json` (e.g. `1.0.3`).
2. **Update lockfile**:
   ```powershell
   npm install --package-lock-only
   ```
3. **Commit the version change**:
   ```powershell
   git add package.json package-lock.json
   git commit -m "chore: bump version to 1.0.3"
   ```
4. **Run checks**:
   ```powershell
   npm ci
   npm run typecheck
   npm run lint
   npm test
   ```
5. **Push commits**:
   ```powershell
   git push origin main
   ```
6. **Create and push a new tag** (must match the version, with a `v` prefix):
   ```powershell
   git tag v1.0.3
   git push origin v1.0.3
   ```
7. **Verify release** in GitHub → **Actions**, then **Releases**. Confirm the workflow succeeded, the Windows installer asset name matches the `url` in `latest.yml`, and `latest.yml` is attached.

**Note:** Replace `1.0.3` / `v1.0.3` with the next version. Pushing a `v*` tag triggers the release workflow.
