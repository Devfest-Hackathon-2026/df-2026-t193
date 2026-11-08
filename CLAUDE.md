# となりナビ — implementation instructions

- User communication: Korean. Product copy: Japanese (`apps/web/src/copy/ja.ts`; procedure copy in `flows/`).
- Current specification: `specs/001-frontend-foundation/`. Current verification: `docs/frontend-status.md`.
- Approved visual source: `docs/design-baseline/`. Preserve the large kiosk scene, overlapping white panel, 30px instruction, light audio row and blue 72–76px primary action. Do not restore the retired design board or generate images.
- Preserve repository README/LICENSE. This is a public submission repository; its supplied README says Actions and Pages are unavailable.
- `/demo` is an explicit fixture mode; `/` uses the real-camera and HTTP path; `/mock/hospital` is a synthetic kiosk. Never silently replace API failures with fixtures.
- Only reviewed registered flows and locally supported scene versions may render instructions. The user operates the kiosk; phone state must not operate it remotely.
- No private photos, credentials, audio recordings, transcripts, .env, node_modules or generated dist in commits. No microphone in this scope. Never add client-side provider keys.
- Keep camera, request and audio cleanup on cancellation/navigation/background. Do not bypass personal-information stops.
- Run relevant tests, typecheck, build and format:check. Browser tests use fake media and synthetic fixtures. Real-device and backend verification are separate.
- Work on the existing checkout; preserve others' work. This implementation was prepared locally on main at base e83f6c30d89aa066713e792c6d8bc640bc67d909. Shared work branch: feat/frontend-foundation. GitHub publication is tracked by its PR; deployment remains separate.
