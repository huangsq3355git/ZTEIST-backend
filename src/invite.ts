import { randomBytes } from 'node:crypto'
import type { DB } from './db'

const CODE_PREFIX = 'ZTE'
// 去掉易混淆的 I/O/0/1（共 32 字符，256 % 32 == 0，取模无偏）
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

function randomCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomBytes(1)[0] % CODE_ALPHABET.length]
  }
  return CODE_PREFIX + out
}

/** 给会员生成专属分享码（幂等：已有码直接返回）。码不携带国家/语言，归因到 uid。 */
export function generateInviteCode(db: DB, uid: string): string {
  const existing = db
    .prepare('SELECT code FROM invite_codes WHERE owner_uid = ?')
    .get(uid) as { code: string } | undefined
  if (existing) return existing.code

  const insert = db.prepare(
    'INSERT INTO invite_codes (code, owner_uid, created_at) VALUES (?, ?, ?)'
  )
  for (let i = 0; i < 20; i++) {
    const code = randomCode()
    try {
      insert.run(code, uid, Date.now())
      return code
    } catch {
      // 主键碰撞则重试
    }
  }
  throw new Error('生成分享码失败：重试耗尽')
}

export interface InviteInfo {
  code: string
  inviterName: string | null
  inviterNameEn: string | null
}

/** 落地页用：由码反查邀请人姓名（返回 null = 码不存在）。 */
export function getInviteInfo(db: DB, rawCode: string): InviteInfo | null {
  const code = rawCode.trim().toUpperCase()
  const row = db
    .prepare(
      `SELECT c.code AS code, m.name AS name, m.name_en AS name_en
       FROM invite_codes c
       LEFT JOIN members m ON m.uid = c.owner_uid
       WHERE c.code = ?`
    )
    .get(code) as { code: string; name: string | null; name_en: string | null } | undefined

  if (!row) return null
  return { code: row.code, inviterName: row.name, inviterNameEn: row.name_en }
}

export type AttributeResult =
  | { ok: true; referrerUid: string }
  | { ok: false; reason: 'CODE_NOT_FOUND' | 'OWN_CODE' | 'ALREADY_ATTRIBUTED' }

/** 注册时归因：新用户填的码 → 记 referrer。防自邀、防重复。 */
export function attributeInvite(db: DB, rawCode: string, newUid: string): AttributeResult {
  const code = rawCode.trim().toUpperCase()
  const row = db
    .prepare('SELECT owner_uid FROM invite_codes WHERE code = ?')
    .get(code) as { owner_uid: string | null } | undefined

  if (!row || !row.owner_uid) return { ok: false, reason: 'CODE_NOT_FOUND' }
  if (row.owner_uid === newUid) return { ok: false, reason: 'OWN_CODE' }

  const dup = db
    .prepare('SELECT 1 FROM code_redemptions WHERE code = ? AND uid = ?')
    .get(code, newUid)
  if (dup) return { ok: false, reason: 'ALREADY_ATTRIBUTED' }

  db.prepare('INSERT INTO code_redemptions (code, uid) VALUES (?, ?)').run(code, newUid)
  db.prepare('UPDATE members SET invite_code = ?, referrer_uid = ? WHERE uid = ?').run(
    code,
    row.owner_uid,
    newUid
  )
  return { ok: true, referrerUid: row.owner_uid }
}
