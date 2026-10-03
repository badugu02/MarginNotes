import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

function makePdf(text: string): Buffer {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  const content = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ]
  let source = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source))
    source += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(source)
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) source += `${String(offset).padStart(10, '0')} 00000 n \n`
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(source)
}

async function freePort(): Promise<number> {
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const address = listener.address()
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port.')
  const port = address.port
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(baseUrl: string, child: ChildProcess) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Test API process exited before it became ready.')
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error('Test API did not become ready.')
}

async function postForm(baseUrl: string, cookie: string, path: string, fileContents: Buffer, fileName: string, branch = 'Computer Science', semester = 1) {
  const form = new FormData()
  form.append('file', new Blob([fileContents], { type: 'application/pdf' }), fileName)
  form.append('branch', branch)
  form.append('semester', String(semester))
  return fetch(`${baseUrl}${path}`, { method: 'POST', headers: { Cookie: cookie }, body: form })
}

test('auth, page-grounded chat, admin controls, feedback, and analytics', { timeout: 30_000 }, async (t) => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'margin-note-'))
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn(join(process.cwd(), 'node_modules', '.bin', 'tsx'), ['server/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CLIENT_ORIGIN: baseUrl,
      JWT_SECRET: 'test-only-secret-that-is-long-enough',
      DATABASE_PATH: join(dataDirectory, 'test.sqlite'),
      ADMIN_EMAIL: 'faculty@example.test',
      ADMIN_PASSWORD: 'test-faculty-password',
    },
    stdio: 'ignore',
  })
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await once(child, 'exit').catch(() => undefined)
    }
    await rm(dataDirectory, { recursive: true, force: true })
  })

  await waitForServer(baseUrl, child)
  const providers = await fetch(`${baseUrl}/api/auth/providers`)
  assert.deepEqual(await providers.json(), { google: false })
  const unavailableGoogle = await fetch(`${baseUrl}/api/auth/google`)
  assert.equal(unavailableGoogle.status, 503)
  const signupResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Student One', email: 'student@example.test', password: 'test-student-password' }),
  })
  assert.equal(signupResponse.status, 201)
  const studentCookie = signupResponse.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(studentCookie)

  const forbiddenUpload = await postForm(baseUrl, studentCookie, '/api/admin/documents', makePdf('course text'), 'course.pdf')
  assert.equal(forbiddenUpload.status, 403)

  const adminResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'faculty@example.test', password: 'test-faculty-password' }),
  })
  assert.equal(adminResponse.status, 200)
  const adminCookie = adminResponse.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(adminCookie)

  const uploadResponse = await postForm(baseUrl, adminCookie, '/api/admin/documents', makePdf('Examination period begins on 12 June. Six courses are included in this academic semester.'), 'academic-regulations.pdf')
  const uploadText = await uploadResponse.text()
  assert.equal(uploadResponse.status, 201, uploadText)
  const uploadBody = JSON.parse(uploadText) as { document: { id: string; status: string } }
  assert.equal(uploadBody.document.status, 'ready')

  const chat = (question: string) => fetch(`${baseUrl}/api/chat`, {
    method: 'POST', headers: { Cookie: studentCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, branch: 'Computer Science', semester: 1 }),
  })
  const answerResponse = await chat('When does the examination period begin?')
  assert.equal(answerResponse.status, 200)
  const answerBody = await answerResponse.json() as { assistantMessage: { id: string; content: string; sources: Array<{ documentName: string; page: number; excerpt: string }> } }
  assert.equal(answerBody.assistantMessage.sources[0]?.documentName, 'academic-regulations.pdf')
  assert.equal(answerBody.assistantMessage.sources[0]?.page, 1)
  assert.match(answerBody.assistantMessage.sources[0]?.excerpt ?? '', /12 June/)
  assert.equal(answerBody.assistantMessage.content, answerBody.assistantMessage.sources[0]?.excerpt)

  const unknownResponse = await chat('Which campus cafeteria has the best coffee?')
  const unknownBody = await unknownResponse.json() as { assistantMessage: { content: string; sources: unknown[] } }
  assert.equal(unknownBody.assistantMessage.content, "I couldn't find this in the syllabus.")
  assert.equal(unknownBody.assistantMessage.sources.length, 0)

  const feedbackResponse = await fetch(`${baseUrl}/api/messages/${answerBody.assistantMessage.id}/feedback`, {
    method: 'POST', headers: { Cookie: studentCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: -1 }),
  })
  assert.equal(feedbackResponse.status, 200)
  const analytics = await fetch(`${baseUrl}/api/admin/analytics`, { headers: { Cookie: adminCookie } })
  assert.equal(analytics.status, 200)
  const analyticsBody = await analytics.json() as { totals: { negativeCount: number; questionCount: number } }
  assert.equal(analyticsBody.totals.negativeCount, 1)
  assert.equal(analyticsBody.totals.questionCount, 2)

  const replacement = await postForm(baseUrl, adminCookie, `/api/admin/documents/${uploadBody.document.id}/replace`, makePdf('The laboratory practical begins on Friday morning.'), 'updated-practical.pdf', 'Electronics', 3)
  const replacementText = await replacement.text()
  assert.equal(replacement.status, 200, replacementText)
  const replacementBody = JSON.parse(replacementText) as { document: { branch: string; semester: number } }
  assert.equal(replacementBody.document.branch, 'Electronics')
  assert.equal(replacementBody.document.semester, 3)
  const filteredDocuments = await fetch(`${baseUrl}/api/documents?branch=Electronics&semester=3`, { headers: { Cookie: adminCookie } })
  const filteredBody = await filteredDocuments.json() as { documents: Array<{ id: string }> }
  assert.equal(filteredBody.documents.length, 1)
  assert.equal(filteredBody.documents[0]?.id, uploadBody.document.id)
  const oldQuestionResponse = await chat('When does the examination period begin?')
  const oldQuestion = await oldQuestionResponse.json() as { assistantMessage: { content: string } }
  assert.equal(oldQuestion.assistantMessage.content, "I couldn't find this in the syllabus.")

  const deleteResponse = await fetch(`${baseUrl}/api/admin/documents/${uploadBody.document.id}`, { method: 'DELETE', headers: { Cookie: adminCookie } })
  assert.equal(deleteResponse.status, 204)
})
