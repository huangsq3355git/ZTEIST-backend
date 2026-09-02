import type { DB } from './db'

export type PublishKind = 'supply_demand' | 'job' | 'project'

export interface PublishInput {
  kind: PublishKind
  lang?: string // 'zh' | 'en'，发布页面语言
  // 供求
  type?: string // supply | demand
  category?: string
  title: string
  content?: string
  country?: string
  contact?: string
  expiry?: number | null
  // 招聘
  role?: string
  requirements?: string
  // 项目
  description?: string
  budget?: string
  timeline?: string
}

export type PublishResult =
  | { ok: true; id: number }
  | { ok: false; reason: 'TITLE_REQUIRED' | 'INVALID_KIND' }

/** 发布信息：按 kind 写入 supply_demand / jobs / projects。 */
export function publishPost(db: DB, uid: string, input: PublishInput): PublishResult {
  if (!input.title?.trim()) return { ok: false, reason: 'TITLE_REQUIRED' }

  const now = Date.now()
  const lang = input.lang === 'en' ? 'en' : 'zh'
  let info: { lastInsertRowid: number | bigint }

  if (input.kind === 'supply_demand') {
    info = db
      .prepare(
        'INSERT INTO supply_demand (uid, type, category, title, content, country, contact, expiry, status, lang, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(uid, input.type ?? null, input.category ?? null, input.title.trim(), input.content ?? null, input.country ?? null, input.contact ?? null, input.expiry ?? null, 'active', lang, now)
  } else if (input.kind === 'job') {
    info = db
      .prepare(
        'INSERT INTO jobs (uid, title, role, requirements, country, contact, expiry, status, lang, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(uid, input.title.trim(), input.role ?? null, input.requirements ?? null, input.country ?? null, input.contact ?? null, input.expiry ?? null, 'active', lang, now)
  } else if (input.kind === 'project') {
    info = db
      .prepare(
        'INSERT INTO projects (uid, title, category, description, country, budget, timeline, contact, expiry, status, lang, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(uid, input.title.trim(), input.category ?? null, input.description ?? null, input.country ?? null, input.budget ?? null, input.timeline ?? null, input.contact ?? null, input.expiry ?? null, 'active', lang, now)
  } else {
    return { ok: false, reason: 'INVALID_KIND' }
  }

  return { ok: true, id: Number(info.lastInsertRowid) }
}

/** 我的发布：合并供求/招聘/项目，按时间倒序。 */
export function listMyPosts(db: DB, uid: string) {
  const sd = db
    .prepare(
      "SELECT id, 'supply_demand' AS kind, type, category, title, content, country, status, created_at FROM supply_demand WHERE uid = ?"
    )
    .all(uid)
  const jobs = db
    .prepare(
      "SELECT id, 'job' AS kind, title, role, requirements, country, status, created_at FROM jobs WHERE uid = ?"
    )
    .all(uid)
  const projects = db
    .prepare(
      "SELECT id, 'project' AS kind, title, category, description, country, budget, timeline, status, created_at FROM projects WHERE uid = ?"
    )
    .all(uid)

  return [...sd, ...jobs, ...projects].sort((a: any, b: any) => b.created_at - a.created_at)
}

/** 下架自己的发布（软删，status → closed）。返回是否成功。 */
export function closePost(db: DB, uid: string, kind: PublishKind, id: number): boolean {
  const table = kind === 'supply_demand' ? 'supply_demand' : kind === 'job' ? 'jobs' : 'projects'
  const info = db.prepare(`UPDATE ${table} SET status = 'closed' WHERE id = ? AND uid = ?`).run(id, uid)
  return info.changes > 0
}
