# Release process

1. Merge the reviewed package change in `armature-tech/mcp-tester`.
2. Wait for **Sync AI Traffic** to copy the package to `armature-tech/ai-traffic`.
3. Wait for the public repository CI checks.
4. Run the public **Publish** workflow with the exact version, the package name
   `@armature-tech/ai-traffic`, and `dry_run=true`.
5. Review the saved tarball and SHA-256 artifact.
6. Run the same workflow with the same version and `dry_run=false`.
7. Confirm the GitHub tag and release. Then install that exact version from npm
   in a clean test project.

The `npm-production` environment must contain `NPM_TOKEN`. The workflow builds,
tests, saves, and publishes one exact tarball. It also asks npm for a provenance
statement. Never publish from a developer computer.

Use semantic versioning. Increase the patch version for a compatible fix. Increase
the minor version for a compatible feature. Increase the major version for a
breaking API or behavior change.
