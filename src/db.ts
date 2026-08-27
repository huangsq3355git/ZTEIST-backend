import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { COUNTRIES } from './countries'

export type DB = Database.Database

let _db: DB | null = null

/** 打开（或复用）数据库，首次调用时建表 + 灌国家数据。 */
export function getDb(): DB {
  if (_db) return _db

  const file = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'zteist.db')
  fs.mkdirSync(path.dirname(file), { recursive: true })

  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  initSchema(db)
  _db = db
  return db
}

function initSchema(db: DB): void {
  db.exec(`
    -- 登录凭证（复用 AIF：邮箱验证码 / 昵称密码 / 预留微信）
    CREATE TABLE IF NOT EXISTS accounts (
      uid           TEXT PRIMARY KEY,   -- 规范 uid
      email         TEXT UNIQUE,
      nickname      TEXT UNIQUE,
      password_hash TEXT,               -- scrypt 盐:哈希
      openid        TEXT,               -- 微信登录预留
      unionid       TEXT,
      created_at    INTEGER NOT NULL
    );

    -- 邮箱验证码（6 位，10 分钟有效，5 次尝试）
    CREATE TABLE IF NOT EXISTS auth_codes (
      email      TEXT PRIMARY KEY,
      code       TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    -- 成员档案（结构化标签；联系字段隐私分级，仅登录/同部门可见）
    CREATE TABLE IF NOT EXISTS members (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      uid          TEXT NOT NULL UNIQUE REFERENCES accounts(uid),
      name         TEXT NOT NULL,
      name_en      TEXT,                -- 英文名/拼音（外籍）
      country      TEXT NOT NULL,       -- 所在地国家（现状，自选全世界）
      province     TEXT,                -- 所在省份（现状，国内用户）
      era_start    INTEGER,             -- 入职年
      era_end      INTEGER,             -- 离职年
      product_line TEXT,                -- 产品线：手机/基站/芯片/...
      role         TEXT,                -- 岗位：研发/市场/HR/...
      tech_domain  TEXT,                -- 技术方向：硬件/软件/算法/...
      industry     TEXT,                -- 当前行业（现状）
      employment_status TEXT,           -- 在职状态：创业/在职/退休/自由职业
      department   TEXT,
      level        TEXT,                -- 职级（认证用）
      wechat       TEXT,                -- 隐私
      linkedin     TEXT,                -- 隐私（外籍）
      whatsapp     TEXT,                -- 隐私（外籍）
      phone        TEXT,                -- 隐私
      invite_code  TEXT,                -- 注册用的分享码（归因）
      referrer_uid TEXT,                -- 推荐人 uid
      member_type  TEXT NOT NULL DEFAULT 'trial',  -- trial=观察期/member=认证会员/expert=专家库/user=普通
      created_at   INTEGER NOT NULL
    );

    -- 通用专属分享码：每人一个码，码不携带国家/语言，归因到 owner_uid
    CREATE TABLE IF NOT EXISTS invite_codes (
      code       TEXT PRIMARY KEY,      -- ZTE + 6 位（去 I/O/0/1）
      owner_uid  TEXT,                  -- 归属人；NULL = 创始码
      created_at INTEGER NOT NULL
    );

    -- 防重复：同一人同一码只兑一次
    CREATE TABLE IF NOT EXISTS code_redemptions (
      code TEXT NOT NULL,
      uid  TEXT NOT NULL,
      PRIMARY KEY (code, uid)
    );

    -- 全世界国家表（注册下拉用，见 src/countries.ts）
    CREATE TABLE IF NOT EXISTS countries (
      code    TEXT PRIMARY KEY,         -- ISO 两位：CN/SG/IN/...
      name_zh TEXT NOT NULL,
      name_en TEXT NOT NULL,
      region  TEXT NOT NULL,            -- 亚洲/欧洲/非洲/北美洲/南美洲/大洋洲
      enabled INTEGER NOT NULL DEFAULT 1
    );

    -- 供求（供/求 + 分类）
    CREATE TABLE IF NOT EXISTS supply_demand (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      uid        TEXT NOT NULL,
      type       TEXT NOT NULL,         -- 'supply' | 'demand'
      category   TEXT,                  -- 项目/产品/资源/合作
      title      TEXT NOT NULL,
      content    TEXT,
      country    TEXT,
      contact    TEXT,
      expiry     INTEGER,
      status     TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    );

    -- 招聘
    CREATE TABLE IF NOT EXISTS jobs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      uid          TEXT NOT NULL,
      title        TEXT NOT NULL,
      role         TEXT,
      requirements TEXT,
      country      TEXT,
      contact      TEXT,
      expiry       INTEGER,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   INTEGER NOT NULL
    );

    -- 项目（独立发布，区别于供求）
    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      uid         TEXT NOT NULL,
      title       TEXT NOT NULL,
      category    TEXT,                -- 项目类型：出海/本地化/技术合作/供应链/落地服务
      description TEXT,
      country     TEXT,
      budget      TEXT,                -- 预算（可选）
      timeline    TEXT,                -- 周期（可选）
      contact     TEXT,                -- 联系方式（隐私分级）
      status      TEXT NOT NULL DEFAULT 'active',
      expiry      INTEGER,
      created_at  INTEGER NOT NULL
    );
  `)

  // 迁移：CREATE TABLE IF NOT EXISTS 不会给已存在的表补列，这里兜底
  ensureColumn(db, 'members', 'level', 'level TEXT')
  ensureColumn(db, 'members', 'member_type', "member_type TEXT NOT NULL DEFAULT 'trial'")
  ensureColumn(db, 'members', 'province', 'province TEXT')
  ensureColumn(db, 'members', 'industry', 'industry TEXT')
  ensureColumn(db, 'members', 'employment_status', 'employment_status TEXT')

  seedCountries(db)
}

function ensureColumn(db: DB, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

function seedCountries(db: DB): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO countries (code, name_zh, name_en, region) VALUES (?, ?, ?, ?)'
  )
  for (const c of COUNTRIES) {
    insert.run(c.code, c.zh, c.en, c.region)
  }
}
