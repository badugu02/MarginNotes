# Margin Note

A local-first college syllabus assistant. Students ask questions against PDFs tagged by branch and semester; answers contain passages extracted from matching source pages, and unsupported questions receive an explicit abstention. Faculty can upload, replace, and remove documents and review common questions and negative ratings.

## Run locally

Requirements: Node.js 22.12 or newer and npm.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set a long, unique `JWT_SECRET`, faculty `ADMIN_EMAIL`, and faculty `ADMIN_PASSWORD`.
3. Run `npm run dev:all`.
4. Open the Vite URL printed in the terminal, usually `http://localhost:5173`.
5. Sign in with the faculty email/password from `.env` to add PDFs. Students can create their own accounts from the sign-in screen.

Google sign-in is optional: add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`, and register the matching `GOOGLE_CALLBACK_URL` (`http://localhost:3001/api/auth/google/callback` for local development) as an authorized redirect URI in Google Cloud. The Google button stays hidden until both credentials are configured. The app links Google accounts only when Google confirms the email address.

The API listens on port 3001 by default. SQLite data and private PDF uploads are stored in `data/`. Set `PORT`, `DATABASE_PATH`, or `CLIENT_ORIGIN` in `.env` to change defaults. Restart the API after changing environment values.

## What works

- Email/password student accounts with persistent, user-scoped conversation history.
- Faculty account provisioned from environment configuration; admin APIs are role-checked.
- Branch and semester selection, English/Telugu question input, source excerpts, document names, page citations, and answer ratings.
- Text-based PDF upload tagged by branch and semester, searchable course filters, page extraction, status reporting, replacement with updated tags, and deletion. Uploads are limited to 25 MB. Image-only scanned PDFs are rejected because OCR is outside the MVP.
- Admin usage metrics, most-asked questions, and negatively rated answers.
- Responsive student and faculty interfaces for desktop and mobile browsers.

## Retrieval and answer policy

This MVP uses local lexical matching over selectable PDF text; it does not call a general-purpose LLM. A positive answer is copied verbatim from a matching page, with its document and page attached as a citation; it is deliberately extractive rather than a generated paraphrase. If no page passes the retrieval threshold, the response is exactly: `I couldn't find this in the syllabus.` Telugu questions are tokenized with Unicode-aware matching; answers and quoted passages retain the document's original language. Validate retrieval quality against the college's own question set before launch; the target 80% citation/answer metric has not yet been measured.

OCR, multi-college tenancy, and production deployment hardening are not included. Before a public deployment, configure HTTPS and secure secrets, add request throttling and upload scanning, review privacy/retention requirements, and plan database/PDF backups.

## Checks

- `npm test` runs an end-to-end API smoke test for authentication, permissions, PDF indexing, citations, abstention, replacement, feedback, analytics, and deletion.
- `npm run build` checks and builds the client and type-checks the API.
- `npm run lint` runs Oxlint.
