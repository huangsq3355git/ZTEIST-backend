import type { DB } from './db'

// 公开列表字段（不含 uid/contact，联系方式隐私分级，列表不暴露）

export function listSupplyDemand(
  db: DB,
  params: { type?: string; category?: string; country?: string; lang?: string },
  limit = 50
) {
  const where = ['status = ?']
  const args: unknown[] = ['active']
  if (params.type) {
    where.push('type = ?')
    args.push(params.type)
  }
  if (params.category) {
    where.push('category = ?')
    args.push(params.category)
  }
  if (params.country) {
    where.push('country = ?')
    args.push(params.country)
  }
  if (params.lang) {
    where.push('lang = ?')
    args.push(params.lang)
  }
  const cols = 'id, type, category, title, content, country, expiry, created_at'
  const sql = `SELECT ${cols} FROM supply_demand WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`
  args.push(limit)
  return db.prepare(sql).all(...args)
}

export function listJobs(db: DB, params: { role?: string; country?: string; lang?: string }, limit = 50) {
  const where = ['status = ?']
  const args: unknown[] = ['active']
  if (params.role) {
    where.push('role = ?')
    args.push(params.role)
  }
  if (params.country) {
    where.push('country = ?')
    args.push(params.country)
  }
  if (params.lang) {
    where.push('lang = ?')
    args.push(params.lang)
  }
  const cols = 'id, title, role, requirements, country, expiry, created_at'
  const sql = `SELECT ${cols} FROM jobs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`
  args.push(limit)
  return db.prepare(sql).all(...args)
}

export function listProjects(
  db: DB,
  params: { category?: string; country?: string; lang?: string },
  limit = 50
) {
  const where = ['status = ?']
  const args: unknown[] = ['active']
  if (params.category) {
    where.push('category = ?')
    args.push(params.category)
  }
  if (params.country) {
    where.push('country = ?')
    args.push(params.country)
  }
  if (params.lang) {
    where.push('lang = ?')
    args.push(params.lang)
  }
  const cols = 'id, title, category, description, country, budget, timeline, expiry, created_at'
  const sql = `SELECT ${cols} FROM projects WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`
  args.push(limit)
  return db.prepare(sql).all(...args)
}
