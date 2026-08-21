import type { DB } from './db'

// 公开字段：搜索结果 / 他人主页可见；不含隐私联系方式（邮箱/微信/LinkedIn/WhatsApp/手机）
export const PUBLIC_MEMBER_COLS = [
  'id',
  'name',
  'name_en',
  'country',
  'era_start',
  'era_end',
  'product_line',
  'role',
  'tech_domain',
  'department',
]

export interface MemberInput {
  name: string
  nameEn?: string | null
  country: string
  eraStart?: number | null
  eraEnd?: number | null
  productLine?: string | null
  role?: string | null
  techDomain?: string | null
  department?: string | null
  wechat?: string | null
  linkedin?: string | null
  whatsapp?: string | null
  phone?: string | null
}

export interface MemberRow {
  id: number
  uid: string
  name: string
  name_en: string | null
  country: string
  era_start: number | null
  era_end: number | null
  product_line: string | null
  role: string | null
  tech_domain: string | null
  department: string | null
  wechat: string | null
  linkedin: string | null
  whatsapp: string | null
  phone: string | null
  invite_code: string | null
  referrer_uid: string | null
  created_at: number
}

export type CreateMemberResult =
  | { ok: true; memberId: number }
  | { ok: false; reason: 'NAME_REQUIRED' | 'COUNTRY_REQUIRED' | 'ALREADY_EXISTS' }

/** 注册：给 uid 建成员档案。姓名/国家必填，其余标签选填。 */
export function createMember(db: DB, uid: string, input: MemberInput): CreateMemberResult {
  const name = input.name?.trim()
  const country = input.country?.trim()
  if (!name) return { ok: false, reason: 'NAME_REQUIRED' }
  if (!country) return { ok: false, reason: 'COUNTRY_REQUIRED' }

  if (db.prepare('SELECT 1 FROM members WHERE uid = ?').get(uid)) {
    return { ok: false, reason: 'ALREADY_EXISTS' }
  }

  const info = db
    .prepare(
      `INSERT INTO members (
         uid, name, name_en, country, era_start, era_end, product_line,
         role, tech_domain, department, wechat, linkedin, whatsapp, phone, created_at
       ) VALUES (
         @uid, @name, @nameEn, @country, @eraStart, @eraEnd, @productLine,
         @role, @techDomain, @department, @wechat, @linkedin, @whatsapp, @phone, @createdAt
       )`
    )
    .run({
      uid,
      name,
      nameEn: input.nameEn ?? null,
      country,
      eraStart: input.eraStart ?? null,
      eraEnd: input.eraEnd ?? null,
      productLine: input.productLine ?? null,
      role: input.role ?? null,
      techDomain: input.techDomain ?? null,
      department: input.department ?? null,
      wechat: input.wechat ?? null,
      linkedin: input.linkedin ?? null,
      whatsapp: input.whatsapp ?? null,
      phone: input.phone ?? null,
      createdAt: Date.now(),
    })

  return { ok: true, memberId: Number(info.lastInsertRowid) }
}

/** 自己的完整档案（含联系方式）。 */
export function getMember(db: DB, uid: string): MemberRow | undefined {
  return db.prepare('SELECT * FROM members WHERE uid = ?').get(uid) as MemberRow | undefined
}

/** 他人档案（仅公开字段，隐私分级）。 */
export function getPublicMember(db: DB, uid: string): Partial<MemberRow> | undefined {
  return db
    .prepare(`SELECT ${PUBLIC_MEMBER_COLS.join(', ')} FROM members WHERE uid = ?`)
    .get(uid) as Partial<MemberRow> | undefined
}
