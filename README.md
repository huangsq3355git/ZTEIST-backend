# ZTEIST

独立项目后端骨架。技术栈与 AI-Fortune 后端一致（TypeScript + Fastify + better-sqlite3），便于复用邀请码/会员等既有逻辑。

## 目录

```
src/
  server.ts          # 入口（Fastify 骨架）
docs/
  邀请码逻辑参考.md   # 从 AI-Fortune 复用的邀请码逻辑说明
```

## 复用邀请码逻辑

会员注册要复用邀请码逻辑，见 [docs/邀请码逻辑参考.md](docs/邀请码逻辑参考.md)。
权威源码在 `F:\solar-scoring\apps\web-api\src\db.ts`（`invite_codes` 表 + `generateReferralCode` / `redeemInviteCode` / `rewardOwner` 等函数）。

## 开发

```bash
npm install
npm run dev    # tsx watch
npm run build  # tsc → dist/
npm start      # node dist/server.js
```

## 方案决策（2026-08-21）

- **部署**：复用 AIF 香港服务器（43.154.138.250，同机 PM2）。
- **登录 V1.0**：邮箱验证码 + 昵称密码（照搬 AIF 逻辑，见 [docs/登录逻辑参考.md](docs/登录逻辑参考.md)）。
- **微信扫码登录**：V1.1 再做（需企业认证 + 域名备案，暂缓）。
- **会员中心**：参考 AIF + 新增采购/招聘信息发布（见 [docs/会员中心参考.md](docs/会员中心参考.md)）。

## 部署（复用香港服务器，⚠️ 与 AIF 同机）

- 服务器：`ssh ubuntu@43.154.138.250`
- **端口用 3003+**（AIF 已占 3000 solar-scoring / 3001 web-api / 3002 pay-gateway，别撞）
- **PM2 起新 app**，名如 `zteist-web-api`（别跟 `solar-*` 混）
- **nginx 加新路由**：zteist.com → ZTEIST 新端口
- 部署铁律同 AIF：本地 build 无 error → commit/push → 服务器 pull → `pm2 reload` → 盯 `pm2 list` ↺ → 冒烟

## 待定

- 产品功能（TBD）
- 会员档位与邀请码参数（复用时按 ZTEIST 调整前缀/天数/额度）
