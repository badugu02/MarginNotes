# Workspace Notes

- This workspace is the Margin Note college syllabus assistant: React/Vite client, Express API, SQLite persistence, and PDF.js text extraction.
- Start both processes with `npm run dev:all`. The Vite proxy forwards `/api` to the API on port 3001.
- Keep uploaded PDFs and the SQLite database under ignored `data/`; never serve uploaded files publicly.
- Student answers must be grounded in retrieved page text and include document/page citations. Preserve the exact abstention response when retrieval has no match.
- Admin-only document and analytics routes must continue to enforce the authenticated admin role on the server.
- Run `npm test` and `npm run build` after changing API or retrieval behavior.
