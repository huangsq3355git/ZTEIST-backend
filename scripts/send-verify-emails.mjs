// 批量发送「认证会员」通知邮件（中英双语），走 Resend REST API。
// 用法：node scripts/send-verify-emails.mjs <recipients.json>
// recipients.json = [{ "name": "...", "email": "..." }, ...]
// 限流：每次发送间隔 600ms；遇到 429（当日额度用完）立即停止，剩余留待次日批次。
import fs from 'node:fs'
import dotenv from 'dotenv'

dotenv.config({ path: '/opt/zteist/.env' })

const file = process.argv[2]
if (!file) {
  console.error('用法: node scripts/send-verify-emails.mjs <recipients.json>')
  process.exit(1)
}

const recipients = JSON.parse(fs.readFileSync(file, 'utf8'))
if (!Array.isArray(recipients) || recipients.length === 0) {
  console.error('收件人列表为空或格式错误')
  process.exit(1)
}

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.error('未配置 RESEND_API_KEY')
  process.exit(1)
}
const from = process.env.RESEND_FROM ?? '中友会 <noreply@zteist.com>'
const subject = '【中友会】你已成为认证会员 · You’re now a verified member'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function html(name) {
  return `
<div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333;line-height:1.7;">
  <h2 style="margin:0 0 20px;color:#002544;">中友会 ZTEIST</h2>

  <p style="margin:0 0 8px;">${esc(name)}，你好：</p>
  <p style="margin:0 0 16px;">欢迎加入中友会（ZTEIST）——中兴人的同事录 / 校友录社区。</p>
  <p style="margin:0 0 16px;">你的会员身份已升级为「<strong>认证会员</strong>」。现在你可以：</p>
  <ul style="margin:0 0 16px;padding-left:20px;">
    <li>全量检索老同事（按国家、年代、产品线、岗位等）</li>
    <li>发布供求、招聘、项目信息</li>
    <li>查看其他认证会员的联系方式，方便对接</li>
  </ul>
  <p style="margin:0 0 16px;">建议登录补充更多信息标签，让老同事更容易找到你，也方便你找到他们。</p>
  <p style="margin:0 0 16px;">👉 登录：<a href="https://zteist.com/" style="color:#008ED3;">https://zteist.com/</a></p>
  <p style="margin:0 0 8px;">有任何问题或建议，欢迎写信至 <a href="mailto:support@zteist.com" style="color:#008ED3;">support@zteist.com</a>。</p>
  <p style="margin:0;">中友会 ZTEIST</p>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">

  <p style="margin:0 0 8px;">Hi ${esc(name)},</p>
  <p style="margin:0 0 16px;">Welcome to ZTEIST — the colleague &amp; alumni community for everyone who has been part of ZTE.</p>
  <p style="margin:0 0 16px;">Your membership has been upgraded to "<strong>Verified Member</strong>". You can now:</p>
  <ul style="margin:0 0 16px;padding-left:20px;">
    <li>Search all colleagues (by country, era, product line, role, etc.)</li>
    <li>Publish supply/demand, jobs, and projects</li>
    <li>View other verified members' contact info</li>
  </ul>
  <p style="margin:0 0 16px;">We recommend logging in to add more info tags so colleagues can find you more easily.</p>
  <p style="margin:0 0 16px;">👉 Sign in: <a href="https://zteist.com/" style="color:#008ED3;">https://zteist.com/</a></p>
  <p style="margin:0 0 8px;">Questions or feedback? Email <a href="mailto:support@zteist.com" style="color:#008ED3;">support@zteist.com</a>.</p>
  <p style="margin:0;">ZTEIST</p>
</div>
`
}

let ok = 0
let fail = 0
let stopped = false

for (const r of recipients) {
  if (stopped) break
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [r.email], subject, html: html(r.name) }),
    })
    if (res.ok) {
      ok++
      console.log(`[ok] ${r.email}`)
    } else {
      fail++
      const body = await res.text()
      console.log(`[FAIL] ${r.email} -> ${res.status} ${body.slice(0, 200)}`)
      if (res.status === 429) {
        console.log('遇到 429 限流（当日额度用完），停止本批次。')
        stopped = true
      }
    }
  } catch (e) {
    fail++
    console.log(`[ERROR] ${r.email} -> ${e.message}`)
  }
  await new Promise((resolve) => setTimeout(resolve, 600))
}

console.log(`\n本批次完成：成功 ${ok}，失败 ${fail}，共 ${recipients.length}${stopped ? '（被限流中断）' : ''}`)
