import 'dotenv/config'
import Fastify, { type FastifyRequest } from 'fastify'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getDb } from './db'
import * as auth from './auth'
import * as invite from './invite'
import * as members from './members'
import * as search from './search'
import * as market from './market'

const app = Fastify({ logger: true })
const db = getDb()

// ---- 登录态 token（HMAC 签名，无外部依赖） ----
const AUTH_SECRET = process.env.AUTH_SECRET ?? 'dev-secret-change-me'

function signToken(uid: string): string {
  const payload = Buffer.from(JSON.stringify({ uid })).toString('base64url')
  const sig = createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verifyToken(token: string): string | null {
  const dot = token.indexOf('.')
  if (dot < 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return (JSON.parse(Buffer.from(payload, 'base64url').toString()) as { uid: string }).uid
  } catch {
    return null
  }
}

function requireUid(req: FastifyRequest): string | null {
  const h = req.headers.authorization
  if (typeof h !== 'string' || !h.startsWith('Bearer ')) return null
  return verifyToken(h.slice(7))
}

// ---- 公共 ----
app.get('/health', async () => ({ status: 'ok' }))

// 国家列表（注册下拉用，全世界）
app.get('/api/countries', async () =>
  db
    .prepare(
      'SELECT code, name_zh, name_en, region FROM countries WHERE enabled = 1 ORDER BY region, name_zh'
    )
    .all()
)

// 邀请落地页（公开）：码 → 邀请人姓名
app.get<{ Params: { code: string } }>('/api/invite/:code', async (req, reply) => {
  const info = invite.getInviteInfo(db, req.params.code)
  if (!info) return reply.code(404).send({ error: 'CODE_NOT_FOUND' })
  return info
})

// ---- 认证 ----
app.post<{ Body: { nickname: string; password: string } }>(
  '/api/auth/register-nickname',
  async (req, reply) => {
    const r = auth.registerNickname(db, req.body.nickname, req.body.password)
    if (!r.ok) return reply.code(400).send({ error: r.reason })
    return { token: signToken(r.uid), uid: r.uid }
  }
)

app.post<{ Body: { nickname: string; password: string } }>(
  '/api/auth/login-nickname',
  async (req, reply) => {
    const r = auth.loginNickname(db, req.body.nickname, req.body.password)
    if (!r.ok) return reply.code(401).send({ error: r.reason })
    return { token: signToken(r.uid), uid: r.uid }
  }
)

app.post<{ Body: { email: string } }>('/api/auth/issue-code', async (req) => {
  const code = auth.issueCode(db, req.body.email)
  await auth.sendAuthCode(req.body.email, code)
  return { ok: true }
})

app.post<{ Body: { email: string; code: string } }>('/api/auth/verify-code', async (req, reply) => {
  const r = auth.verifyCode(db, req.body.email, req.body.code)
  if (!r.ok) return reply.code(401).send({ error: r.reason })
  return { token: signToken(r.uid), uid: r.uid }
})

app.post<{ Body: { idToken: string } }>('/api/auth/google', async (req, reply) => {
  const r = await auth.googleLogin(db, req.body.idToken)
  if (!r.ok) return reply.code(401).send({ error: r.reason })
  return { token: signToken(r.uid), uid: r.uid }
})

// ---- 成员（需登录） ----
app.post<{ Body: members.MemberInput & { inviteCode?: string } }>(
  '/api/member/create',
  async (req, reply) => {
    const uid = requireUid(req)
    if (!uid) return reply.code(401).send({ error: 'UNAUTHORIZED' })

    const r = members.createMember(db, uid, req.body)
    if (!r.ok) return reply.code(400).send({ error: r.reason })

    if (req.body.inviteCode) {
      invite.attributeInvite(db, req.body.inviteCode, uid)
    }
    return { ok: true, memberId: r.memberId }
  }
)

app.get('/api/member/me', async (req, reply) => {
  const uid = requireUid(req)
  if (!uid) return reply.code(401).send({ error: 'UNAUTHORIZED' })
  const m = members.getMember(db, uid)
  if (!m) return reply.code(404).send({ error: 'NO_PROFILE' })
  return m
})

// ---- 邀请码（需登录） ----
app.get('/api/invite/generate', async (req, reply) => {
  const uid = requireUid(req)
  if (!uid) return reply.code(401).send({ error: 'UNAUTHORIZED' })
  return { code: invite.generateInviteCode(db, uid) }
})

// ---- 搜索（需登录，仅返回公开字段） ----
function parsePeopleParams(q: Record<string, string>): search.SearchParams {
  return {
    q: q.q,
    country: q.country,
    province: q.province,
    productLine: q.productLine,
    role: q.role,
    techDomain: q.techDomain,
    industry: q.industry,
    employmentStatus: q.employmentStatus,
    eraStart: q.eraStart ? Number(q.eraStart) : undefined,
    eraEnd: q.eraEnd ? Number(q.eraEnd) : undefined,
  }
}

app.get<{ Querystring: Record<string, string> }>('/api/search', async (req, reply) => {
  const uid = requireUid(req)
  if (!uid) return reply.code(401).send({ error: 'UNAUTHORIZED' })
  return search.searchMembers(db, parsePeopleParams(req.query))
})

// ---- 人员列表（浏览面，需登录） ----
app.get<{ Querystring: Record<string, string> }>('/api/people', async (req, reply) => {
  const uid = requireUid(req)
  if (!uid) return reply.code(401).send({ error: 'UNAUTHORIZED' })
  return search.searchMembers(db, parsePeopleParams(req.query))
})

// ---- 供求/招聘/项目（需登录，仅公开字段） ----
app.get<{ Querystring: Record<string, string> }>('/api/supply-demand', async (req, reply) => {
  const uid = requireUid(req)
  if (!uid) return reply.code(401).send({ error: 'UNAUTHORIZED' })
  return market.listSupplyDemand(db, {
    type: req.query.type,
    category: req.query.category,
    country: req.query.country,
  })
})

app.get<{ Querystring: Record<string, string> }>('/api/jobs', async (req, reply) => {
  const uid = requireUid(req)
  if (!uid) return reply.code(401).send({ error: 'UNAUTHORIZED' })
  return market.listJobs(db, { role: req.query.role, country: req.query.country })
})

app.get<{ Querystring: Record<string, string> }>('/api/projects', async (req, reply) => {
  const uid = requireUid(req)
  if (!uid) return reply.code(401).send({ error: 'UNAUTHORIZED' })
  return market.listProjects(db, { category: req.query.category, country: req.query.country })
})

const port = Number(process.env.PORT ?? 3003)
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
