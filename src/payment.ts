import type { DB } from './db'

// 用 Stripe REST API + Node 内置 fetch，不依赖 SDK
const STRIPE_API = 'https://api.stripe.com/v1'

export type CheckoutResult = { url: string } | { error: string }

export type Currency = 'cny' | 'usd'

// 会员付费档位 → Stripe 固定价格 ID（测试账号「LEADING HK ZTEIST 沙盒」，一次性付款）
// cny 人民币 / usd 美元；金额：支持会员 ¥99/$14.88，企业会员 ¥1999/$299
const PRICES: Record<string, Record<Currency, string>> = {
  supporter: {
    cny: 'price_1UI1C1CcG05qRfUO4dTecIih',
    usd: 'price_1UI1C1CcG05qRfUOelFmn3Jr',
  },
  enterprise: {
    cny: 'price_1UI1C2CcG05qRfUOB786aFC9',
    usd: 'price_1UI1C2CcG05qRfUO9tjbMOow',
  },
}

/** 创建 Checkout Session，返回跳转支付链接。 */
export async function createCheckoutSession(uid: string, tier: string, currency: Currency = 'cny'): Promise<CheckoutResult> {
  const sk = process.env.STRIPE_SECRET_KEY
  if (!sk) return { error: 'NOT_CONFIGURED' }
  const price = PRICES[tier]
  if (!price) return { error: 'INVALID_TIER' }
  const priceId = price[currency]
  if (!priceId) return { error: 'INVALID_CURRENCY' }

  const site = process.env.SITE_URL || 'https://zteist.com'
  const langPath = currency === 'usd' ? 'en' : 'zh'
  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${site}/${langPath}/account/?payment=success`,
    cancel_url: `${site}/${langPath}/account/?payment=cancel`,
    'metadata[uid]': uid,
    'metadata[tier]': tier,
  })

  try {
    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sk}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    const data = await res.json()
    if (!res.ok) return { error: data?.error?.message || 'STRIPE_ERROR' }
    return { url: data.url || '' }
  } catch {
    return { error: 'STRIPE_ERROR' }
  }
}

/** 处理支付回调：checkout.session.completed → 升级付费档位。 */
export function handleWebhookEvent(db: DB, event: any): void {
  if (event?.type !== 'checkout.session.completed') return
  const session = event.data?.object
  const uid = session?.metadata?.uid
  const tier = session?.metadata?.tier
  if (uid && tier) {
    db.prepare('UPDATE members SET paid_tier = ? WHERE uid = ?').run(tier, uid)
  }
}
