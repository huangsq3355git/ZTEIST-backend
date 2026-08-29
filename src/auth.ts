import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import type { DB } from './db'

// ---- 账号 / uid ----

/** 规范 uid：跨设备认领的账号标识。 */
export function newUid(): string {
  return randomUUID()
}

// ---- 密码（scrypt：salt 16 字节，hash 64 字节，存 `salt:hash`） ----

function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const candidate = scryptSync(password, salt, 64)
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

// ---- 昵称 + 密码 ----

export type RegNicknameResult =
  | { ok: true; uid: string }
  | { ok: false; reason: 'NICKNAME_TAKEN' }

export function registerNickname(db: DB, nickname: string, password: string): RegNicknameResult {
  const exists = db.prepare('SELECT 1 FROM accounts WHERE nickname = ?').get(nickname)
  if (exists) return { ok: false, reason: 'NICKNAME_TAKEN' }

  const uid = newUid()
  db.prepare(
    'INSERT INTO accounts (uid, nickname, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).run(uid, nickname, hashPassword(password), Date.now())
  return { ok: true, uid }
}

export type LoginNicknameResult =
  | { ok: true; uid: string }
  | { ok: false; reason: 'NOT_FOUND' | 'WRONG_PASSWORD' }

export function loginNickname(db: DB, nickname: string, password: string): LoginNicknameResult {
  const row = db
    .prepare('SELECT uid, password_hash FROM accounts WHERE nickname = ?')
    .get(nickname) as { uid: string; password_hash: string | null } | undefined

  if (!row) return { ok: false, reason: 'NOT_FOUND' }
  if (!row.password_hash || !verifyPassword(password, row.password_hash)) {
    return { ok: false, reason: 'WRONG_PASSWORD' }
  }
  return { ok: true, uid: row.uid }
}

// ---- 邮箱验证码（6 位，10 分钟有效，5 次尝试） ----

const CODE_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5

export function issueCode(db: DB, email: string): string {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  db.prepare(
    `INSERT INTO auth_codes (email, code, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET
       code = excluded.code,
       expires_at = excluded.expires_at,
       attempts = 0,
       created_at = excluded.created_at`
  ).run(email, code, Date.now() + CODE_TTL_MS, Date.now())
  return code
}

/** 发验证码邮件（无 Resend key 时只打日志，不真发）。 */
export async function sendAuthCode(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[auth] 无 RESEND_API_KEY，验证码 ${code} 仅日志（email=${email}）`)
    return
  }

  const from = process.env.RESEND_FROM ?? 'ZTEIST 中友会 <noreply@zteist.com>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: '【ZTEIST 中友会】登录验证码',
        html: `<p>你的验证码是：<strong>${code}</strong></p><p>10 分钟内有效，请勿泄露。</p>`,
      }),
    })
    if (!res.ok) {
      console.error(`[auth] Resend 发送失败：${res.status} ${await res.text()}`)
      return
    }
    console.log(`[auth] 验证码已发送到 ${email}`)
  } catch (e) {
    console.error('[auth] Resend 发送异常', e)
  }
}

export type VerifyCodeResult =
  | { ok: true; uid: string }
  | { ok: false; reason: 'NO_CODE' | 'EXPIRED' | 'WRONG' | 'TOO_MANY_ATTEMPTS' }

export function verifyCode(db: DB, email: string, code: string): VerifyCodeResult {
  const row = db
    .prepare('SELECT code, expires_at, attempts FROM auth_codes WHERE email = ?')
    .get(email) as { code: string; expires_at: number; attempts: number } | undefined

  if (!row) return { ok: false, reason: 'NO_CODE' }
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'TOO_MANY_ATTEMPTS' }
  if (Date.now() > row.expires_at) return { ok: false, reason: 'EXPIRED' }
  if (row.code !== code) {
    db.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ?').run(email)
    return { ok: false, reason: 'WRONG' }
  }

  db.prepare('DELETE FROM auth_codes WHERE email = ?').run(email)
  return { ok: true, uid: claimAccount(db, email) }
}

// ---- 认领账号（邮箱 → 规范 uid） ----

export function claimAccount(db: DB, email: string): string {
  const row = db
    .prepare('SELECT uid FROM accounts WHERE email = ?')
    .get(email) as { uid: string } | undefined
  if (row) return row.uid

  const uid = newUid()
  db.prepare('INSERT INTO accounts (uid, email, created_at) VALUES (?, ?, ?)').run(
    uid,
    email,
    Date.now()
  )
  return uid
}

// ---- Google 一键登录 ----

let _googleClient: OAuth2Client | null = null

export type GoogleLoginResult =
  | { ok: true; uid: string; isNew: boolean }
  | { ok: false; reason: 'NOT_CONFIGURED' | 'INVALID_TOKEN' | 'NO_EMAIL' }

/** Google 一键登录：验证 ID token → 映射账号（openid/email）→ 返回 uid。 */
export async function googleLogin(db: DB, idToken: string): Promise<GoogleLoginResult> {
  const cid = process.env.GOOGLE_CLIENT_ID
  if (!cid) return { ok: false, reason: 'NOT_CONFIGURED' }
  if (!_googleClient) _googleClient = new OAuth2Client(cid)

  try {
    const ticket = await _googleClient.verifyIdToken({ idToken, audience: cid })
    const payload = ticket.getPayload()
    if (!payload?.email || !payload?.sub) return { ok: false, reason: 'NO_EMAIL' }
    const email = payload.email
    const sub = payload.sub // Google 用户唯一 ID → 存 openid

    let row = db.prepare('SELECT uid FROM accounts WHERE openid = ?').get(sub) as { uid: string } | undefined
    if (!row) row = db.prepare('SELECT uid FROM accounts WHERE email = ?').get(email) as { uid: string } | undefined

    if (row) {
      db.prepare('UPDATE accounts SET openid = ? WHERE uid = ?').run(sub, row.uid)
      return { ok: true, uid: row.uid, isNew: false }
    }

    const uid = newUid()
    db.prepare('INSERT INTO accounts (uid, email, openid, created_at) VALUES (?, ?, ?, ?)').run(uid, email, sub, Date.now())
    return { ok: true, uid, isNew: true }
  } catch {
    return { ok: false, reason: 'INVALID_TOKEN' }
  }
}
