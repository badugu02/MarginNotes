import 'dotenv/config'
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import multer from 'multer'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { db } from './db.js'
import { retrieve, type Citation } from './retrieval.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const jwtSecret = process.env.JWT_SECRET ?? 'local-development-secret-change-before-deploying'
const uploadDirectory = join(process.cwd(), 'data', 'uploads')
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL ?? `http://localhost:${port}/api/auth/google/callback`
const googleClient = googleClientId && googleClientSecret
  ? new OAuth2Client(googleClientId, googleClientSecret, googleCallbackUrl)
  : undefined
const branches = ['Computer Science', 'Information Technology', 'Electronics', 'Electrical', 'Mechanical', 'Civil']
const semesters = [1, 2, 3, 4, 5, 6, 7, 8]

type Role = 'student' | 'admin'
type SessionUser = { id: string; email: string; name: string; role: Role }
type DocumentRecord = { id: string; name: string; branch: string; semester: number; status: string; error: string | null; uploaded_at: string }
type StoredMessage = { id: string; role: 'user' | 'assistant'; content: string; sources_json: string; feedback: number | null; created_at: string }

const allowedMimeTypes = new Set(['application/pdf', 'application/x-pdf'])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, allowedMimeTypes.has(file.mimetype) || file.originalname.toLowerCase().endsWith('.pdf')),
})

app.use(cors({ origin: clientOrigin, credentials: true }))
app.use(express.json({ limit: '1mb' }))

function sessionUser(req: Request): SessionUser | undefined {
  const cookie = req.headers.cookie?.split(';').map((value) => value.trim()).find((value) => value.startsWith('syllabus_session='))
  const token = cookie?.slice('syllabus_session='.length)
  if (!token) return undefined
  try {
    return jwt.verify(token, jwtSecret) as SessionUser
  } catch {
    return undefined
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = sessionUser(req)
  if (!user) return res.status(401).json({ error: 'Please sign in to continue.' })
  res.locals.user = user
  next()
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = sessionUser(req)
  if (!user) return res.status(401).json({ error: 'Please sign in to continue.' })
  if (user.role !== 'admin') return res.status(403).json({ error: 'Faculty access required.' })
  res.locals.user = user
  next()
}

function setSession(res: Response, user: SessionUser) {
  const token = jwt.sign(user, jwtSecret, { expiresIn: '7d' })
  res.cookie('syllabus_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

function publicUser(user: SessionUser) {
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

async function readPdf(buffer: Buffer): Promise<Array<{ page: number; text: string }>> {
  const loadingTask = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, verbosity: 0 })
  const document = await loadingTask.promise
  const pages: Array<{ page: number; text: string }> = []
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .filter((item) => 'str' in item)
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) pages.push({ page: pageNumber, text })
    }
  } finally {
    await loadingTask.destroy()
  }
  return pages
}

function writePageRecords(documentId: string, pages: Array<{ page: number; text: string }>) {
  const insertPage = db.prepare('INSERT INTO pages (document_id, page_number, text) VALUES (?, ?, ?)')
  const insertAll = db.transaction((items: Array<{ page: number; text: string }>) => {
    for (const page of items) insertPage.run(documentId, page.page, page.text)
  })
  insertAll(pages)
}

const configuredAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const configuredAdminPassword = process.env.ADMIN_PASSWORD
if (configuredAdminEmail && configuredAdminPassword) {
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(configuredAdminEmail)
  if (!existingAdmin) {
    db.prepare('INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), configuredAdminEmail, process.env.ADMIN_NAME ?? 'Faculty administrator', bcrypt.hashSync(configuredAdminPassword, 12), 'admin')
  }
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.get('/api/options', (_req, res) => res.json({ branches, semesters }))
app.get('/api/auth/providers', (_req, res) => res.json({ google: Boolean(googleClient) }))

app.get('/api/auth/google', (_req, res) => {
  if (!googleClient) return res.status(503).json({ error: 'Google sign-in has not been configured.' })
  const state = randomBytes(32).toString('base64url')
  res.cookie('syllabus_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
  })
  res.redirect(googleClient.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  }))
})

app.get('/api/auth/google/callback', async (req, res) => {
  if (!googleClient) return res.status(503).send('Google sign-in has not been configured.')
  const stateCookie = req.headers.cookie?.split(';').map((value) => value.trim())
    .find((value) => value.startsWith('syllabus_oauth_state='))?.slice('syllabus_oauth_state='.length)
  res.clearCookie('syllabus_oauth_state', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  if (!stateCookie || typeof req.query.state !== 'string' || stateCookie !== req.query.state) {
    return res.redirect(`${clientOrigin}/?auth_error=google_state`)
  }
  if (typeof req.query.code !== 'string') return res.redirect(`${clientOrigin}/?auth_error=google_denied`)

  try {
    const { tokens } = await googleClient.getToken(req.query.code)
    const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token ?? '', audience: googleClientId })
    const profile = ticket.getPayload()
    if (!profile?.sub || !profile.email || profile.email_verified !== true) {
      return res.redirect(`${clientOrigin}/?auth_error=google_unverified`)
    }

    let userRow = db.prepare('SELECT id, email, name, role, google_id FROM users WHERE google_id = ? OR email = ?')
      .get(profile.sub, profile.email.toLowerCase()) as (SessionUser & { google_id: string | null }) | undefined
    if (userRow) {
      if (userRow.google_id && userRow.google_id !== profile.sub) return res.redirect(`${clientOrigin}/?auth_error=google_link`)
      db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(profile.sub, userRow.id)
    } else {
      const id = randomUUID()
      const name = (profile.name ?? profile.email.split('@')[0]).slice(0, 80)
      db.prepare('INSERT INTO users (id, email, name, password_hash, google_id) VALUES (?, ?, ?, ?, ?)')
        .run(id, profile.email.toLowerCase(), name, await bcrypt.hash(randomBytes(48).toString('base64url'), 12), profile.sub)
      userRow = { id, email: profile.email.toLowerCase(), name, role: 'student', google_id: profile.sub }
    }
    setSession(res, { id: userRow.id, email: userRow.email, name: userRow.name, role: userRow.role })
    res.redirect(clientOrigin)
  } catch (error) {
    console.error('Google sign-in failed:', error)
    res.redirect(`${clientOrigin}/?auth_error=google_failed`)
  }
})

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body ?? {}
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    return res.status(400).json({ error: 'Enter a name between 2 and 80 characters.' })
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Enter a valid email address.' })
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  }
  const id = randomUUID()
  try {
    db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)')
      .run(id, email.trim().toLowerCase(), name.trim(), await bcrypt.hash(password, 12))
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) return res.status(409).json({ error: 'An account with that email already exists.' })
    throw error
  }
  const user: SessionUser = { id, email: email.trim().toLowerCase(), name: name.trim(), role: 'student' }
  setSession(res, user)
  res.status(201).json({ user: publicUser(user) })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Enter your email and password.' })
  const row = db.prepare('SELECT id, email, name, password_hash, role FROM users WHERE email = ?').get(email.trim()) as (SessionUser & { password_hash: string }) | undefined
  if (!row || !(await bcrypt.compare(password, row.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' })
  const user: SessionUser = { id: row.id, email: row.email, name: row.name, role: row.role }
  setSession(res, user)
  res.json({ user: publicUser(user) })
})

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('syllabus_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  res.status(204).end()
})

app.get('/api/auth/me', (req, res) => {
  const user = sessionUser(req)
  res.json({ user: user ? publicUser(user) : null })
})

app.get('/api/documents', requireAuth, (req, res) => {
  const user = res.locals.user as SessionUser
  const { branch, semester } = req.query
  let records: unknown[]
  if (user.role === 'admin') {
    const filters: string[] = []
    const values: Array<string | number> = []
    if (typeof branch === 'string' && branch !== 'all') {
      if (!branches.includes(branch)) return res.status(400).json({ error: 'Choose a valid branch filter.' })
      filters.push('branch = ?')
      values.push(branch)
    }
    if (typeof semester === 'string' && semester !== 'all') {
      const semesterNumber = Number(semester)
      if (!semesters.includes(semesterNumber)) return res.status(400).json({ error: 'Choose a valid semester filter.' })
      filters.push('semester = ?')
      values.push(semesterNumber)
    }
    records = db.prepare(`SELECT id, name, branch, semester, status, error, uploaded_at FROM documents ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY uploaded_at DESC`).all(...values)
  } else {
    records = db.prepare("SELECT id, name, branch, semester, status, error, uploaded_at FROM documents WHERE branch = ? AND semester = ? AND status = 'ready' ORDER BY name")
      .all(branch, Number(semester)) as unknown[]
  }
  res.json({ documents: records as DocumentRecord[] })
})

app.post('/api/admin/documents', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a PDF file to upload.' })
  const { branch, semester: semesterValue } = req.body as { branch?: string; semester?: string }
  const semester = Number(semesterValue)
  if (!branches.includes(branch ?? '') || !semesters.includes(semester)) return res.status(400).json({ error: 'Choose a valid branch and semester.' })

  const id = randomUUID()
  const storagePath = join(uploadDirectory, `${id}.pdf`)
  db.prepare('INSERT INTO documents (id, name, branch, semester, status, storage_path) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.file.originalname.slice(0, 200), branch, semester, 'processing', storagePath)
  try {
    const pages = await readPdf(req.file.buffer)
    if (pages.length === 0) throw new Error('No selectable text found. Scanned PDFs are not supported.')
    writeFileSync(storagePath, req.file.buffer, { flag: 'wx' })
    writePageRecords(id, pages)
    db.prepare("UPDATE documents SET status = 'ready', error = NULL WHERE id = ?").run(id)
    res.status(201).json({ document: db.prepare('SELECT id, name, branch, semester, status, error, uploaded_at FROM documents WHERE id = ?').get(id) })
  } catch (error) {
    db.prepare("UPDATE documents SET status = 'failed', error = ? WHERE id = ?")
      .run(error instanceof Error ? error.message.slice(0, 240) : 'PDF could not be processed.', id)
    if (existsSync(storagePath)) unlinkSync(storagePath)
    res.status(422).json({ error: error instanceof Error ? error.message : 'PDF could not be processed.' })
  }
})

app.post('/api/admin/documents/:id/replace', requireAdmin, upload.single('file'), async (req, res) => {
  const current = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as (DocumentRecord & { storage_path: string }) | undefined
  if (!current) return res.status(404).json({ error: 'Document not found.' })
  if (!req.file) return res.status(400).json({ error: 'Choose a replacement PDF.' })
  const { branch, semester: semesterValue } = req.body as { branch?: string; semester?: string }
  const semester = Number(semesterValue)
  if (!branches.includes(branch ?? '') || !semesters.includes(semester)) return res.status(400).json({ error: 'Choose a valid branch and semester.' })
  const storagePath = join(uploadDirectory, `${current.id}.pdf`)
  db.prepare("UPDATE documents SET status = 'processing', error = NULL WHERE id = ?").run(current.id)
  try {
    const pages = await readPdf(req.file.buffer)
    if (pages.length === 0) throw new Error('No selectable text found. Scanned PDFs are not supported.')
    const replaceContents = db.transaction(() => {
      db.prepare('DELETE FROM pages WHERE document_id = ?').run(current.id)
      writePageRecords(current.id, pages)
      db.prepare("UPDATE documents SET name = ?, branch = ?, semester = ?, storage_path = ?, status = 'ready', error = NULL, uploaded_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(req.file!.originalname.slice(0, 200), branch, semester, storagePath, current.id)
    })
    writeFileSync(storagePath, req.file.buffer)
    replaceContents()
    if (current.storage_path !== storagePath && existsSync(current.storage_path)) unlinkSync(current.storage_path)
    res.json({ document: db.prepare('SELECT id, name, branch, semester, status, error, uploaded_at FROM documents WHERE id = ?').get(current.id) })
  } catch (error) {
    db.prepare("UPDATE documents SET status = 'ready', error = ? WHERE id = ?")
      .run(error instanceof Error ? error.message.slice(0, 240) : 'Replacement could not be processed.', current.id)
    res.status(422).json({ error: error instanceof Error ? error.message : 'Replacement could not be processed.' })
  }
})

app.delete('/api/admin/documents/:id', requireAdmin, (req, res) => {
  const record = db.prepare('SELECT storage_path FROM documents WHERE id = ?').get(req.params.id) as { storage_path: string } | undefined
  if (!record) return res.status(404).json({ error: 'Document not found.' })
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id)
  if (existsSync(record.storage_path)) unlinkSync(record.storage_path)
  res.status(204).end()
})

app.get('/api/conversations', requireAuth, (_req, res) => {
  const user = res.locals.user as SessionUser
  const conversations = db.prepare(`
    SELECT c.id, c.title, c.created_at AS createdAt, c.updated_at AS updatedAt,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, rowid DESC LIMIT 1) AS lastMessage
    FROM conversations c WHERE c.user_id = ? ORDER BY c.updated_at DESC
  `).all(user.id)
  res.json({ conversations })
})

app.get('/api/conversations/:id', requireAuth, (req, res) => {
  const user = res.locals.user as SessionUser
  const conversation = db.prepare('SELECT id, title FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, user.id)
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' })
  const rows = db.prepare('SELECT id, role, content, sources_json, feedback, created_at AS createdAt FROM messages WHERE conversation_id = ? ORDER BY rowid')
    .all(req.params.id) as Array<StoredMessage & { createdAt: string }>
  res.json({ conversation, messages: rows.map((row) => ({ id: row.id, role: row.role, content: row.content, sources: JSON.parse(row.sources_json) as Citation[], feedback: row.feedback, createdAt: row.createdAt })) })
})

app.post('/api/chat', requireAuth, (req, res) => {
  const user = res.locals.user as SessionUser
  const { question, branch, semester: semesterValue, conversationId } = req.body ?? {}
  const semester = Number(semesterValue)
  if (typeof question !== 'string' || !question.trim() || question.length > 2000) return res.status(400).json({ error: 'Enter a question up to 2,000 characters.' })
  if (!branches.includes(branch) || !semesters.includes(semester)) return res.status(400).json({ error: 'Choose your branch and semester first.' })
  let activeConversationId = typeof conversationId === 'string' ? conversationId : ''
  if (activeConversationId) {
    const owned = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(activeConversationId, user.id)
    if (!owned) return res.status(404).json({ error: 'Conversation not found.' })
  } else {
    activeConversationId = randomUUID()
    db.prepare('INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)')
      .run(activeConversationId, user.id, question.trim().slice(0, 72))
  }

  const userMessageId = randomUUID()
  db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
    .run(userMessageId, activeConversationId, 'user', question.trim())
  const sources = retrieve(question.trim(), branch, semester)
  const answer = sources.length > 0
    ? sources[0].excerpt
    : "I couldn't find this in the syllabus."
  const assistantMessageId = randomUUID()
  db.prepare('INSERT INTO messages (id, conversation_id, role, content, sources_json) VALUES (?, ?, ?, ?, ?)')
    .run(assistantMessageId, activeConversationId, 'assistant', answer, JSON.stringify(sources))
  db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(activeConversationId)

  res.json({
    conversationId: activeConversationId,
    userMessage: { id: userMessageId, role: 'user', content: question.trim() },
    assistantMessage: { id: assistantMessageId, role: 'assistant', content: answer, sources, feedback: null },
  })
})

app.post('/api/messages/:id/feedback', requireAuth, (req, res) => {
  const user = res.locals.user as SessionUser
  const rating = req.body?.rating
  if (rating !== 1 && rating !== -1) return res.status(400).json({ error: 'Rating must be positive or negative.' })
  const result = db.prepare(`UPDATE messages SET feedback = ? WHERE id = ? AND role = 'assistant'
    AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)`)
    .run(rating, req.params.id, user.id)
  if (result.changes === 0) return res.status(404).json({ error: 'Answer not found.' })
  res.json({ feedback: rating })
})

app.get('/api/admin/analytics', requireAdmin, (_req, res) => {
  const totals = db.prepare(`SELECT
    (SELECT COUNT(*) FROM documents) AS documentCount,
    (SELECT COUNT(*) FROM users WHERE role = 'student') AS studentCount,
    (SELECT COUNT(*) FROM conversations) AS conversationCount,
    (SELECT COUNT(*) FROM messages WHERE role = 'user') AS questionCount,
    (SELECT COUNT(*) FROM messages WHERE role = 'assistant' AND feedback = -1) AS negativeCount
  `).get()
  const topQuestions = db.prepare(`SELECT content AS question, COUNT(*) AS count FROM messages WHERE role = 'user'
    GROUP BY content ORDER BY count DESC, MAX(created_at) DESC LIMIT 8`).all()
  const negativeAnswers = db.prepare(`SELECT answer.content, answer.created_at AS createdAt, u.email, c.title
    FROM messages answer JOIN conversations c ON c.id = answer.conversation_id JOIN users u ON u.id = c.user_id
    WHERE answer.role = 'assistant' AND answer.feedback = -1 ORDER BY answer.created_at DESC LIMIT 8`).all()
  res.json({ totals, topQuestions, negativeAnswers })
})

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'PDF must be smaller than 25 MB.' : error.message })
  }
  console.error(error)
  res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

app.listen(port, () => console.log(`Syllabus Assistant API listening at http://localhost:${port}`))
