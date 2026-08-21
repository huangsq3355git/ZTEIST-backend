# ZTEIST 后端

中友会·同事录/校友录社区的后端。技术栈与 AI-Fortune 后端一致：TypeScript + Fastify + better-sqlite3。

## 目录

- `src/db.ts` — 建表 + 国家种子
- `src/auth.ts` — 登录（邮箱验证码 / 昵称密码，scrypt）
- `src/invite.ts` — 专属分享码（生成 / 反查姓名 / 归因）
- `src/members.ts` — 成员档案（结构化标签）
- `src/search.ts` — 基础搜索（SQL，0 token）
- `src/server.ts` — 入口 + 路由 + 登录态 token

## 部署铁律（同 AIF，血的教训）

1. 所有代码改动走 GitHub：本地 commit → push → 服务器 `git pull`
2. `build` 有 error **绝对不能 reload**
3. `pm2 reload` 后**立刻 `pm2 list` 盯 ↺ 列 5 秒**——涨了 = 崩溃循环，立刻回滚
4. reload 后跑 `bash scripts/smoke-test.sh`，**5/5 全绿**才算成功
5. 不在服务器直接改源码；改完必须 commit；不留 `.bak`

## 关键决策

- 数据库 better-sqlite3（单机够用，等并发写再迁 PostgreSQL）
- 分享码 = 通用专属码 `ZTE`+6位（去 I/O/0/1），**不携带国家/语言**，归因到 `owner_uid`
- 国家注册**必填**、用户自选、全世界（`src/countries.ts`，192 国）
- 语言前期简中 + 英文；邀请链接 `/zh/i/{code}` / `/en/i/{code}`
- AI 后置：搜索用 SQL 确定性查询，AI 只做「自然语言→SQL 翻译」（第二阶段）

## 部署

- 服务器 `ssh ubuntu@43.154.138.250`（与 AIF 同机）
- 端口 **3003**（AIF 占 3000/3001/3002，别撞）
- PM2 app：`zteist-web-api`；代码路径 `/opt/zteist`
- nginx：`zteist.com` → `127.0.0.1:3003`
- 部署：`bash deploy.sh`
