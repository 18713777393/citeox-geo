# DOC-01 Baseline Report

## Commands

- `npm.cmd install`
- `$env:DATABASE_URL='postgresql://geo:geo@127.0.0.1:5432/geo'; npm.cmd run prisma:validate`
- `npm.cmd run build`
- `$env:DATABASE_URL='postgresql://geo:geo@127.0.0.1:5432/geo'; npm.cmd run test:doc01`

## Result

- Dependency install: pass
- Prisma validation: pass with temporary local placeholder `DATABASE_URL`
- TypeScript build: pass
- DOC-01 tests: pass

## Blocking Failures

- None.

## Notes

- Existing implementation already contains auth routes, auth service, auth security helpers, Prisma auth models, and frontend DOC-01 contract tests.
- Plain `npm` is blocked by the local PowerShell execution policy because `npm.ps1` cannot run. Use `npm.cmd` in this Windows environment.
- Do not store the temporary local `DATABASE_URL` in code or committed files.
