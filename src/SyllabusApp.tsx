import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, Clock3, FileText,
  GraduationCap, History, LogOut, MessageCircle, MessageSquareText, MoreHorizontal,
  Plus, Search, Send, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, Upload, Users, X,
} from 'lucide-react'
import './App.css'

type Role = 'student' | 'admin'
type User = { id: string; email: string; name: string; role: Role }
type Citation = { documentId: string; documentName: string; page: number; excerpt: string }
type Message = { id: string; role: 'user' | 'assistant'; content: string; sources?: Citation[]; feedback?: number | null }
type Conversation = { id: string; title: string; lastMessage?: string | null; updatedAt: string }
type DocumentRecord = { id: string; name: string; branch: string; semester: number; status: 'processing' | 'ready' | 'failed'; error: string | null; uploaded_at: string }
type Analytics = {
  totals: { documentCount: number; studentCount: number; conversationCount: number; questionCount: number; negativeCount: number }
  topQuestions: Array<{ question: string; count: number }>
  negativeAnswers: Array<{ content: string; createdAt: string; email: string; title: string }>
}
type View = 'chat' | 'history' | 'materials' | 'insights'
type Language = 'en' | 'te'

const branchOptions = ['Computer Science', 'Information Technology', 'Electronics', 'Electrical', 'Mechanical', 'Civil']
const semesterOptions = [1, 2, 3, 4, 5, 6, 7, 8]
const fallbackError = 'Something went wrong. Please try again.'

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? fallbackError)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function formatDate(value: string) {
  return new Date(value.replace(' ', 'T') + (value.endsWith('Z') ? '' : 'Z')).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function AuthScreen({ onAuthenticated, googleEnabled, initialError }: { onAuthenticated: (user: User) => void; googleEnabled: boolean; initialError: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await api<{ user: User }>(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      onAuthenticated(result.user)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallbackError)
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-shell">
    <div className="auth-brand"><span className="brand-mark"><BookOpen size={21} strokeWidth={2.2} /></span><span>Margin<span className="brand-accent">note</span></span></div>
    <section className="auth-panel">
      <div className="auth-symbol"><GraduationCap size={25} /></div>
      <p className="eyebrow">YOUR CAMPUS, IN CONTEXT</p>
      <h1>{mode === 'login' ? 'Welcome back.' : 'Make room to learn.'}</h1>
      <p className="auth-lede">Ask your syllabus a question. Get the page, not a guess.</p>
      <form className="auth-form" onSubmit={submit}>
        {mode === 'register' && <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} placeholder="e.g. Ananya Rao" /></label>}
        <label>College email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@college.edu" /></label>
        <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={128} placeholder="At least 8 characters" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary auth-submit" type="submit" disabled={loading}>{loading ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight size={16} /></button>
      </form>
      {mode === 'login' && googleEnabled && <><div className="auth-divider"><span>OR</span></div><button className="google-button" type="button" onClick={() => window.location.assign('/api/auth/google')}><GoogleMark />Continue with Google</button></>}
      <div className="auth-switch">{mode === 'login' ? 'New around here?' : 'Already have an account?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></div>
    </section>
    <p className="auth-foot">A quieter way through the reading list.</p>
  </main>
}

function GoogleMark() {
  return <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15Z"/><path fill="#34A853" d="M24 44c5.6 0 10.3-1.9 13.7-5.1l-6.6-5.1c-1.8 1.2-4.1 2-7.1 2-5.4 0-10-3.6-11.7-8.5h-6.8v5.3A20.7 20.7 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.3 27.3a12.4 12.4 0 0 1 0-7.9v-5.3H5.5a20.7 20.7 0 0 0 0 18.5l6.8-5.3Z"/><path fill="#EA4335" d="M24 11.1c3 0 5.7 1 7.8 3.1l5.9-5.9A19.8 19.8 0 0 0 24 2 20.7 20.7 0 0 0 5.5 14.1l6.8 5.3c1.7-4.9 6.3-8.3 11.7-8.3Z"/></svg>
}

function SourceList({ sources }: { sources: Citation[] }) {
  return <div className="source-list">{sources.map((source) => <article className="source-card" key={`${source.documentId}-${source.page}`}>
    <div className="source-meta"><span className="source-file-icon"><FileText size={15} /></span><span className="source-name" title={source.documentName}>{source.documentName}</span><span className="page-tag">p. {source.page}</span></div>
    <p>“{source.excerpt}”</p>
  </article>)}</div>
}

function ChatMessage({ message, onFeedback }: { message: Message; onFeedback: (id: string, rating: number) => void }) {
  const isAssistant = message.role === 'assistant'
  const abstained = isAssistant && message.content.includes("couldn't find")
  return <article className={`message-row ${isAssistant ? 'assistant-row' : 'student-row'}`}>
    {isAssistant && <span className="message-avatar"><Sparkles size={15} /></span>}
    <div className="message-body">
      <div className={`message-bubble ${isAssistant ? 'assistant-bubble' : 'student-bubble'} ${abstained ? 'abstain-bubble' : ''}`}>{message.content}</div>
      {isAssistant && !!message.sources?.length && <SourceList sources={message.sources} />}
      {isAssistant && !abstained && <div className="message-actions"><span>Was this helpful?</span>
        <button type="button" title="Helpful" aria-label="Helpful" className={message.feedback === 1 ? 'rated' : ''} onClick={() => onFeedback(message.id, 1)}><ThumbsUp size={14} /></button>
        <button type="button" title="Not helpful" aria-label="Not helpful" className={message.feedback === -1 ? 'rated' : ''} onClick={() => onFeedback(message.id, -1)}><ThumbsDown size={14} /></button>
      </div>}
    </div>
  </article>
}

export default function SyllabusApp() {
  const [user, setUser] = useState<User | null>(null)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [authError, setAuthError] = useState('')
  const [booting, setBooting] = useState(true)
  const [view, setView] = useState<View>('chat')
  const [language, setLanguage] = useState<Language>('en')
  const [branch, setBranch] = useState(() => localStorage.getItem('syllabus_branch') ?? branchOptions[0])
  const [semester, setSemester] = useState(() => Number(localStorage.getItem('syllabus_semester') ?? '1'))
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [chatLoading, setChatLoading] = useState(false)
  const [pageError, setPageError] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [adminBranch, setAdminBranch] = useState(branchOptions[0])
  const [adminSemester, setAdminSemester] = useState(1)
  const [documentBranchFilter, setDocumentBranchFilter] = useState('all')
  const [documentSemesterFilter, setDocumentSemesterFilter] = useState('all')
  const [historySearch, setHistorySearch] = useState('')
  const messagesEnd = useRef<HTMLDivElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const replaceId = useRef<string | null>(null)

  useEffect(() => {
    Promise.all([
      api<{ user: User | null }>('/api/auth/me').catch(() => null),
      api<{ branches: string[]; semesters: number[] }>('/api/options').catch(() => null),
      api<{ google: boolean }>('/api/auth/providers').catch(() => null),
    ]).then(([session, options, providers]) => {
      if (session?.user) {
        setUser(session.user)
        if (session.user.role === 'admin') setView('materials')
      }
      setGoogleEnabled(providers?.google ?? false)
      const authError = new URLSearchParams(window.location.search).get('auth_error')
      if (authError) {
        setAuthError(authError === 'google_unverified' ? 'Google did not verify this email address.' : 'Google sign-in could not be completed. Please try again.')
        window.history.replaceState({}, '', window.location.pathname)
      }
      if (options?.branches.includes(localStorage.getItem('syllabus_branch') ?? '')) setBranch(localStorage.getItem('syllabus_branch')!)
    }).finally(() => setBooting(false))
  }, [])

  useEffect(() => {
    if (!user) return
    api<{ conversations: Conversation[] }>('/api/conversations').then((result) => setConversations(result.conversations)).catch(() => undefined)
  }, [user])

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, chatLoading])

  useEffect(() => {
    if (!user || (!((view === 'materials') && user.role === 'admin'))) return
    const filters = new URLSearchParams()
    if (documentBranchFilter !== 'all') filters.set('branch', documentBranchFilter)
    if (documentSemesterFilter !== 'all') filters.set('semester', documentSemesterFilter)
    const query = filters.size ? `?${filters}` : ''
    api<{ documents: DocumentRecord[] }>(`/api/documents${query}`).then((result) => setDocuments(result.documents)).catch((cause) => setPageError(cause instanceof Error ? cause.message : fallbackError))
  }, [user, view, documentBranchFilter, documentSemesterFilter])

  useEffect(() => {
    if (!user || view !== 'insights') return
    api<Analytics>('/api/admin/analytics').then(setAnalytics).catch((cause) => setPageError(cause instanceof Error ? cause.message : fallbackError))
  }, [user, view])

  function changeBranch(value: string) {
    setBranch(value)
    localStorage.setItem('syllabus_branch', value)
  }

  function changeSemester(value: number) {
    setSemester(value)
    localStorage.setItem('syllabus_semester', String(value))
  }

  function acceptAuthenticatedUser(authenticatedUser: User) {
    setUser(authenticatedUser)
    setView(authenticatedUser.role === 'admin' ? 'materials' : 'chat')
  }

  function newConversation() {
    setConversationId(null)
    setMessages([])
    setQuestion('')
    setPageError('')
    setView('chat')
  }

  async function openConversation(id: string) {
    setPageError('')
    try {
      const result = await api<{ messages: Message[] }>(`/api/conversations/${id}`)
      setConversationId(id)
      setMessages(result.messages)
      setView('chat')
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : fallbackError)
    }
  }

  async function submitQuestion(event: FormEvent) {
    event.preventDefault()
    if (!question.trim() || chatLoading) return
    setPageError('')
    setChatLoading(true)
    try {
      const result = await api<{ conversationId: string; userMessage: Message; assistantMessage: Message }>('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), branch, semester, conversationId }),
      })
      setConversationId(result.conversationId)
      setMessages((current) => [...current, result.userMessage, result.assistantMessage])
      setQuestion('')
      const history = await api<{ conversations: Conversation[] }>('/api/conversations')
      setConversations(history.conversations)
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : fallbackError)
    } finally {
      setChatLoading(false)
    }
  }

  async function giveFeedback(id: string, rating: number) {
    setMessages((current) => current.map((message) => message.id === id ? { ...message, feedback: rating } : message))
    try {
      await api(`/api/messages/${id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating }) })
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : fallbackError)
    }
  }

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setUser(null)
    setMessages([])
    setConversations([])
    newConversation()
  }

  async function submitPdf(file?: File, documentId?: string) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setPageError('Choose a PDF file.')
      return
    }
    setUploadBusy(true)
    setPageError('')
    setUploadProgress(documentId ? 'Replacing and indexing PDF…' : 'Uploading and indexing PDF…')
    const form = new FormData()
    form.append('file', file)
    form.append('branch', adminBranch)
    form.append('semester', String(adminSemester))
    try {
      await api(documentId ? `/api/admin/documents/${documentId}/replace` : '/api/admin/documents', { method: 'POST', body: form })
      setUploadProgress('')
      setDocumentBranchFilter('all')
      setDocumentSemesterFilter('all')
      const result = await api<{ documents: DocumentRecord[] }>('/api/documents')
      setDocuments(result.documents)
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : fallbackError)
      setUploadProgress('')
      const filters = new URLSearchParams()
      if (documentBranchFilter !== 'all') filters.set('branch', documentBranchFilter)
      if (documentSemesterFilter !== 'all') filters.set('semester', documentSemesterFilter)
      api<{ documents: DocumentRecord[] }>(`/api/documents${filters.size ? `?${filters}` : ''}`).then((result) => setDocuments(result.documents)).catch(() => undefined)
    } finally {
      setUploadBusy(false)
      if (uploadRef.current) uploadRef.current.value = ''
      if (replaceRef.current) replaceRef.current.value = ''
      replaceId.current = null
    }
  }

  async function deleteDocument(document: DocumentRecord) {
    if (!window.confirm(`Delete “${document.name}”? Students will no longer find answers from it.`)) return
    try {
      await api(`/api/admin/documents/${document.id}`, { method: 'DELETE' })
      setDocuments((current) => current.filter((item) => item.id !== document.id))
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : fallbackError)
    }
  }

  if (booting) return <div className="boot-screen"><span className="brand-mark"><BookOpen size={21} /></span><span>Opening your notes…</span></div>
  if (!user) return <AuthScreen onAuthenticated={acceptAuthenticatedUser} googleEnabled={googleEnabled} initialError={authError} />

  const isAdmin = user.role === 'admin'
  const filteredConversations = conversations.filter((item) => `${item.title} ${item.lastMessage ?? ''}`.toLowerCase().includes(historySearch.toLowerCase()))
  const greeting = user.name.split(' ')[0]

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand-lockup" onClick={() => { setView(isAdmin ? 'materials' : 'chat'); setPageError('') }} aria-label="Margin Note home"><span className="brand-mark"><BookOpen size={20} strokeWidth={2.2} /></span><span>Margin<span className="brand-accent">note</span></span></button>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="primary-nav" aria-label="Main navigation">
        {!isAdmin && <>
          <button className={`nav-item ${view === 'chat' ? 'active' : ''}`} onClick={newConversation}><MessageCircle size={17} /><span>Ask a question</span><span className="nav-shortcut">⌘ K</span></button>
          <button className={`nav-item ${view === 'history' ? 'active' : ''}`} onClick={() => { setView('history'); setPageError('') }}><History size={17} /><span>Past conversations</span></button>
        </>}
        {isAdmin && <>
          <button className={`nav-item ${view === 'materials' ? 'active' : ''}`} onClick={() => { setView('materials'); setPageError('') }}><FileText size={17} /><span>Materials</span></button>
          <button className={`nav-item ${view === 'insights' ? 'active' : ''}`} onClick={() => { setView('insights'); setPageError('') }}><MessageSquareText size={17} /><span>Question insights</span></button>
        </>}
      </nav>
      {!isAdmin && <div className="sidebar-recent"><div className="sidebar-section-label recent-label">RECENT</div>
        {conversations.slice(0, 5).map((item) => <button className={`recent-item ${conversationId === item.id ? 'recent-active' : ''}`} key={item.id} onClick={() => openConversation(item.id)} title={item.title}><span>{item.title}</span></button>)}
        {conversations.length === 0 && <p className="quiet-note">Your conversations will show up here.</p>}
      </div>}
      <div className="sidebar-bottom">
        <div className="privacy-note"><ShieldCheck size={15} /><span>{isAdmin ? 'Faculty workspace' : 'Answers grounded in your PDFs'}</span></div>
        <button className="profile-button" onClick={signOut} title="Sign out"><span className="avatar-initials">{user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="profile-info"><strong>{user.name}</strong><small>{isAdmin ? 'Faculty administrator' : user.email}</small></span><LogOut size={16} className="profile-logout" /></button>
      </div>
    </aside>

    <main className="main-panel">
      <header className="topbar">
        <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{isAdmin ? view === 'insights' ? 'Question insights' : 'Materials' : view === 'history' ? 'Past conversations' : 'Ask a question'}</strong></div>
        <div className="topbar-actions">
          {!isAdmin && <>
            <label className="select-wrap branch-select"><span className="sr-only">Branch</span><GraduationCap size={15} /><select value={branch} onChange={(event) => changeBranch(event.target.value)} aria-label="Branch">{branchOptions.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></label>
            <label className="select-wrap semester-select"><span className="sr-only">Semester</span><select value={semester} onChange={(event) => changeSemester(Number(event.target.value))} aria-label="Semester">{semesterOptions.map((item) => <option key={item} value={item}>Semester {item}</option>)}</select><ChevronDown size={13} /></label>
          </>}
          <span className={`role-pill ${isAdmin ? 'faculty-pill' : ''}`}><span />{isAdmin ? 'Faculty' : 'Student'}</span>
        </div>
      </header>
      {pageError && <div className="toast-error" role="alert"><span>{pageError}</span><button onClick={() => setPageError('')} aria-label="Dismiss error"><X size={15} /></button></div>}

      {!isAdmin && view === 'chat' && <section className="chat-screen" aria-label="Syllabus chat">
        <div className="chat-thread">
          {messages.length === 0 ? <div className="welcome-state">
            <span className="welcome-overline"><span className="live-dot" /> YOUR COURSE MATERIAL, CONNECTED</span>
            <h1>Good to have you here,<br /><span>{greeting}.</span></h1>
            <p className="welcome-copy">What are you looking for in your syllabus?</p>
            <div className="suggestion-grid">{(language === 'en' ? [
              { icon: Clock3, label: 'Exam schedule', prompt: 'What is the exam schedule for this semester?' },
              { icon: CheckCircle2, label: 'Passing criteria', prompt: 'What are the passing criteria?' },
              { icon: BookOpen, label: 'Course credits', prompt: 'How many credits are required for this course?' },
            ] : [
              { icon: Clock3, label: 'పరీక్షల షెడ్యూల్', prompt: 'ఈ సెమిస్టర్ పరీక్షల షెడ్యూల్ ఏమిటి?' },
              { icon: CheckCircle2, label: 'ఉత్తీర్ణత ప్రమాణాలు', prompt: 'ఉత్తీర్ణత ప్రమాణాలు ఏమిటి?' },
              { icon: BookOpen, label: 'కోర్సు క్రెడిట్లు', prompt: 'ఈ కోర్సుకు ఎన్ని క్రెడిట్లు అవసరం?' },
            ]).map(({ icon: Icon, label, prompt }) => <button className="suggestion" key={label} onClick={() => setQuestion(prompt)}><Icon size={16} /><span>{label}</span><ArrowRight size={14} className="suggestion-arrow" /></button>)}</div>
          </div> : <div className="messages-list">{messages.map((message) => <ChatMessage key={message.id} message={message} onFeedback={giveFeedback} />)}{chatLoading && <div className="thinking-row"><span className="message-avatar"><Sparkles size={15} /></span><span className="thinking-dots"><i /><i /><i /></span><span>Checking your syllabus…</span></div>}<div ref={messagesEnd} />
          </div>}
        </div>
        <div className="composer-wrap">
          <div className="composer-meta"><span><span className="live-dot" /> Searching <strong>{branch}</strong> · Semester {semester}</span><div className="language-switch" aria-label="Question language"><button className={language === 'en' ? 'language-active' : ''} onClick={() => setLanguage('en')}>EN</button><span>/</span><button className={language === 'te' ? 'language-active' : ''} onClick={() => setLanguage('te')}>తెలుగు</button></div></div>
          <form className="composer" onSubmit={submitQuestion}><textarea rows={1} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder={language === 'en' ? 'Ask anything about your syllabus…' : 'మీ సిలబస్ గురించి ఏదైనా అడగండి…'} aria-label="Your question" maxLength={2000} /><button className="send-button" type="submit" disabled={!question.trim() || chatLoading} aria-label="Send question" title="Send question"><Send size={17} /></button></form>
          <p className="composer-footnote">Answers come only from your college PDFs. No source, no guess.</p>
        </div>
      </section>}

      {!isAdmin && view === 'history' && <section className="content-screen history-screen">
        <div className="page-heading"><div><p className="eyebrow">YOUR STUDY TRAIL</p><h1>Past conversations</h1><p>Pick up where you left off.</p></div><button className="button button-primary" onClick={newConversation}><Plus size={16} />New question</button></div>
        <label className="history-search"><Search size={16} /><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search conversations" /><span>{filteredConversations.length} conversations</span></label>
        <div className="history-list">{filteredConversations.map((item, index) => <button className="history-row" key={item.id} onClick={() => openConversation(item.id)}><span className={`history-icon history-color-${index % 3}`}><MessageCircle size={17} /></span><span className="history-copy"><strong>{item.title}</strong><small>{item.lastMessage ?? 'No messages yet'}</small></span><time>{formatDate(item.updatedAt)}</time><ArrowRight size={15} /></button>)}
          {filteredConversations.length === 0 && <div className="empty-list"><History size={24} /><strong>{historySearch ? 'No matching conversations' : 'Nothing here just yet'}</strong><span>{historySearch ? 'Try a different search.' : 'Ask your first question and it will be saved here.'}</span></div>}
        </div>
      </section>}

      {isAdmin && view === 'materials' && <section className="content-screen admin-screen">
        <div className="page-heading"><div><p className="eyebrow">FACULTY WORKSPACE</p><h1>Course materials</h1><p>Keep the right pages in the right hands.</p></div><div className="admin-count"><span>{documents.filter((doc) => doc.status === 'ready').length}</span> ready to search</div></div>
        <div className="upload-section"><div className="section-title-row"><div><h2>Add a PDF</h2><p>Selectable-text PDFs up to 25 MB. Scanned copies are not supported.</p></div><span className="upload-secure"><ShieldCheck size={14} />Private storage</span></div>
          <div className="upload-controls"><label className="select-wrap admin-select"><GraduationCap size={15} /><select value={adminBranch} onChange={(event) => setAdminBranch(event.target.value)} aria-label="Document branch">{branchOptions.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></label><label className="select-wrap admin-select"><select value={adminSemester} onChange={(event) => setAdminSemester(Number(event.target.value))} aria-label="Document semester">{semesterOptions.map((item) => <option key={item} value={item}>Semester {item}</option>)}</select><ChevronDown size={13} /></label>
            <input ref={uploadRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => void submitPdf(event.target.files?.[0])} />
            <button className="button button-primary" onClick={() => uploadRef.current?.click()} disabled={uploadBusy}><Upload size={16} />{uploadBusy ? 'Processing…' : 'Choose PDF'}</button>
          </div>
          {uploadProgress && <div className="upload-progress"><span className="spinner" />{uploadProgress}<span className="upload-time">Large files can take a minute</span></div>}
        </div>
        <div className="documents-heading"><div><h2>Uploaded documents</h2><p>Replace a file using the branch and semester selected above.</p></div><div className="document-filters">
          <label className="select-wrap document-filter"><span className="sr-only">Filter documents by branch</span><select value={documentBranchFilter} onChange={(event) => setDocumentBranchFilter(event.target.value)} aria-label="Filter documents by branch"><option value="all">All branches</option>{branchOptions.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-wrap document-filter"><span className="sr-only">Filter documents by semester</span><select value={documentSemesterFilter} onChange={(event) => setDocumentSemesterFilter(event.target.value)} aria-label="Filter documents by semester"><option value="all">All semesters</option>{semesterOptions.map((item) => <option key={item} value={item}>Semester {item}</option>)}</select><ChevronDown size={13} /></label>
          <button className="icon-button" onClick={() => { const filters = new URLSearchParams(); if (documentBranchFilter !== 'all') filters.set('branch', documentBranchFilter); if (documentSemesterFilter !== 'all') filters.set('semester', documentSemesterFilter); api<{ documents: DocumentRecord[] }>(`/api/documents${filters.size ? `?${filters}` : ''}`).then((result) => setDocuments(result.documents)).catch((cause) => setPageError(cause instanceof Error ? cause.message : fallbackError)) }} title="Refresh documents" aria-label="Refresh documents"><MoreHorizontal size={19} /></button>
        </div></div>
        <div className="document-table-wrap"><table className="document-table"><thead><tr><th>DOCUMENT</th><th>BRANCH / SEMESTER</th><th>STATUS</th><th>ADDED</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {documents.map((document) => <tr key={document.id}><td><div className="document-name-cell"><span className="pdf-icon">PDF</span><span><strong title={document.name}>{document.name}</strong>{document.error && <small className="document-error">{document.error}</small>}</span></div></td><td><span className="table-branch">{document.branch}</span><small className="table-semester">Semester {document.semester}</small></td><td><span className={`status-tag status-${document.status}`}><span />{document.status === 'ready' ? 'Ready' : document.status === 'processing' ? 'Processing' : 'Needs attention'}</span></td><td className="date-cell">{formatDate(document.uploaded_at)}</td><td><div className="row-actions"><input ref={replaceRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => void submitPdf(event.target.files?.[0], replaceId.current ?? undefined)} /><button className="small-action" disabled={uploadBusy} onClick={() => { replaceId.current = document.id; replaceRef.current?.click() }}>Replace</button><button className="small-action delete-action" onClick={() => void deleteDocument(document)}>Delete</button></div></td></tr>)}
          {documents.length === 0 && <tr><td colSpan={5}><div className="table-empty"><FileText size={22} /><strong>No course PDFs yet</strong><span>Choose a PDF above to make its pages searchable.</span></div></td></tr>}
        </tbody></table></div>
      </section>}

      {isAdmin && view === 'insights' && <section className="content-screen admin-screen insights-screen">
        <div className="page-heading"><div><p className="eyebrow">LISTENING LOOP</p><h1>Question insights</h1><p>What students are asking, and what needs a closer look.</p></div><div className="insight-stamp"><Sparkles size={15} />Live from student feedback</div></div>
        {!analytics ? <div className="analytics-loading"><span className="spinner" />Gathering activity…</div> : <>
          <div className="metric-grid"><div className="metric metric-green"><span>Total questions</span><strong>{analytics.totals.questionCount}</strong><small><MessageCircle size={14} />Questions asked across all chats</small></div><div className="metric metric-blue"><span>Students reached</span><strong>{analytics.totals.studentCount}</strong><small><Users size={14} />Registered student accounts</small></div><div className="metric metric-yellow"><span>Course PDFs</span><strong>{analytics.totals.documentCount}</strong><small><FileText size={14} />Uploaded documents</small></div><div className="metric metric-red"><span>Needs review</span><strong>{analytics.totals.negativeCount}</strong><small><ThumbsDown size={14} />Answers rated not helpful</small></div></div>
          <div className="insight-columns"><section className="insight-panel"><div className="insight-panel-heading"><div><h2>Most asked</h2><p>Questions students come back to.</p></div><span className="panel-count">{analytics.topQuestions.length}</span></div>
            {analytics.topQuestions.length ? <div className="question-ranking">{analytics.topQuestions.map((item, index) => <div className="ranking-row" key={item.question}><span className="ranking-number">{String(index + 1).padStart(2, '0')}</span><span className="ranking-question">{item.question}</span><span className="ranking-count">{item.count}<small> {item.count === 1 ? 'ask' : 'asks'}</small></span></div>)}</div> : <div className="panel-empty">No questions yet. Insights appear as students start chatting.</div>}
          </section><section className="insight-panel review-panel"><div className="insight-panel-heading"><div><h2>Marked not helpful</h2><p>Answers to review against course material.</p></div><span className="feedback-count"><ThumbsDown size={14} />{analytics.negativeAnswers.length}</span></div>
            {analytics.negativeAnswers.length ? <div className="negative-list">{analytics.negativeAnswers.map((item, index) => <article className="negative-item" key={`${item.createdAt}-${index}`}><div className="negative-top"><span className="negative-flag"><ThumbsDown size={12} />Review</span><time>{formatDate(item.createdAt)}</time></div><p>{item.content}</p><small>{item.email} · {item.title}</small></article>)}</div> : <div className="panel-empty success-empty"><Check size={17} />No negative feedback to review.</div>}
          </section></div>
        </>}
      </section>}
    </main>
  </div>
}
