// 每日批量：观察期满 7 天自动转为认证会员（幂等）。
// cron 每天执行一次，兜底处理未登录用户的转正。
import Database from 'better-sqlite3'

const DB_PATH = process.env.DB_PATH ?? '/opt/zteist/data/zteist.db'
const TRIAL_DAYS = 7

const db = new Database(DB_PATH)
const cutoff = Date.now() - TRIAL_DAYS * 24 * 60 * 60 * 1000
const info = db
  .prepare("UPDATE members SET member_type = 'member' WHERE member_type = 'trial' AND created_at <= ?")
  .run(cutoff)
db.close()

console.log(`[${new Date().toISOString()}] 观察期转认证会员 ${info.changes} 人`)
