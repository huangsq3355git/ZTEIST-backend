import type { DB } from './db'

// 用 Stripe REST API + Node 内置 fetch，不依赖 SDK
const STRIPE_API = 'https://api.stripe.com/v1'

export type CheckoutResult = { url: string } | { error: string }

export type Currency = 'cny' | 'usd'

// 会员付费档位（金额单位：分；cny 人民币 / usd 美元）
const PRICES: Record<string, { name: string; cny: number; usd: number }> = {
  supporter: { name: '支持会员', cny: 9900, usd: 1488 },
  enterprise: { name: '企业会员', cny: 199900, usd: 29900 },
}

/** 创建 Checkout Session，返回跳转支付链接。 */
export async function createCheckoutSession(uid: string, tier: string, currency: Currency = 'cny'): Promise<CheckoutResult> {
  const sk = process.env.STRIPE_SECRET_KEY
  if (!sk) return { error: 'NOT_CONFIGURED' }
  const price = PRICES[tier]
  if (!price) return { error: 'INVALID_TIER' }

  const site = process.env.SITE_URL || 'https://zteist.com'
  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': currency,
    'line_items[0][price_data][product_data][name]': `ZTEIST ${price.name}`,
    'line_items[0][price_data][unit_amount]': String(price[currency]),
    'line_items[0][quantity]': '1',
    success_url: `${site}/zh/account/?payment=success`,
    cancel_url: `${site}/zh/account/?payment=cancel`,
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
