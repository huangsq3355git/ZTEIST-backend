import type { DB } from './db'
import { PUBLIC_MEMBER_COLS } from './members'

export interface SearchParams {
  q?: string
  country?: string
  province?: string
  eraStart?: number
  eraEnd?: number
  productLine?: string
  role?: string
  techDomain?: string
  industry?: string
  employmentStatus?: string
}

export interface PublicMember {
  id: number
  name: string
  name_en: string | null
  country: string
  era_start: number | null
  era_end: number | null
  product_line: string | null
  role: string | null
  tech_domain: string | null
  department: string | null
  industry: string | null
  employment_status: string | null
  province: string | null
  level: string | null
  member_type: string
}

/**
 * 基础搜索：关键词组合 → SQL（0 token，不做 AI 匹配）。
 * 在职年代按「区间重叠」匹配：搜索窗口与成员在职区间有交集。
 */
export function searchMembers(db: DB, params: SearchParams, limit = 50): PublicMember[] {
  const where: string[] = []
  const args: unknown[] = []

  if (params.q) {
    const kw = `%${params.q}%`
    where.push('(name LIKE ? OR name_en LIKE ? OR country LIKE ? OR product_line LIKE ? OR role LIKE ? OR tech_domain LIKE ? OR industry LIKE ? OR department LIKE ?)')
    args.push(kw, kw, kw, kw, kw, kw, kw, kw)
  }
  if (params.country) {
    where.push('country = ?')
    args.push(params.country)
  }
  if (params.province) {
    where.push('province = ?')
    args.push(params.province)
  }
  if (params.productLine) {
    where.push('product_line = ?')
    args.push(params.productLine)
  }
  if (params.role) {
    where.push('role = ?')
    args.push(params.role)
  }
  if (params.techDomain) {
    where.push('tech_domain = ?')
    args.push(params.techDomain)
  }
  if (params.industry) {
    where.push('industry = ?')
    args.push(params.industry)
  }
  if (params.employmentStatus) {
    where.push('employment_status = ?')
    args.push(params.employmentStatus)
  }
  // 年代区间重叠：成员入职 <= 搜索结束年，且（仍在职 或 离职 >= 搜索开始年）
  if (params.eraStart != null) {
    where.push('(era_end IS NULL OR era_end >= ?)')
    args.push(params.eraStart)
  }
  if (params.eraEnd != null) {
    where.push('era_start <= ?')
    args.push(params.eraEnd)
  }

  const sql =
    `SELECT ${PUBLIC_MEMBER_COLS.join(', ')} FROM members` +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY id LIMIT ?'
  args.push(limit)

  return db.prepare(sql).all(...args) as PublicMember[]
}
