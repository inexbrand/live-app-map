# vpn-saas admin: роуты без экранов (после)

Собрано `routeScreenGap` по локальной карте vpn-saas-admin (gitignored): 128 из 293.

### no-caller — вход и сессия: вызывает оболочка или внешний вход (12)
- GET /a/:token
- GET /d/:token
- GET /sub/:token/vmess.json
- POST /api/href-viewer/:token/login
- POST /api/href-viewer/:token/login-bot/complete
- POST /api/href-viewer/:token/login-bot/start
- POST /api/login
- POST /api/login-bot/complete
- POST /api/login-bot/start
- POST /api/web/login/key
- POST /api/web/login/telegram
- POST /api/web/logout

### no-caller — в коде репозитория вызова нет (72)
- ALL /api/web/mini/*
- DELETE /api/blog-posts/:slug
- GET /
- GET /
- GET /api/activity
- GET /api/avatars/:username
- GET /api/avatars/tg/:telegramId
- GET /api/blog-posts
- GET /api/blog-posts/:slug
- GET /api/bot-status
- GET /api/channel-posts
- GET /api/channel-posts/:id
- GET /api/forms/media/:fileId
- GET /api/mcp/calls
- GET /api/mcp/code-version
- GET /api/media/:fileId
- GET /api/partner/withdrawals/:id/attachments/:aid
- GET /api/partners/withdrawals/:id/attachments/:aid
- GET /api/permission-catalog
- GET /api/permissions
- GET /api/plans
- GET /api/public
- GET /api/tickets/:id/attachments/:aid
- GET /api/tickets/:id/attachments/:aid
- GET /api/web/blog
- GET /api/web/blog/:slug
- GET /api/web/me
- GET /api/web/public
- GET /api/web/reviews
- GET /api/yookassa/refunds
- GET /geo/geoip-lite.dat
- GET /geo/geoip-lite.dat.sha256
- GET /geo/geoip.dat
- GET /geo/geoip.dat.sha256
- GET /geo/geosite.dat
- GET /geo/geosite.dat.sha256
- GET /index.html
- GET /index.html
- GET /mcp
- GET /transit/plan
- GET /yookassa/checkout-js
- GET /yookassa/qr
- GET /yookassa/widget
- PATCH /api/nodes/monitor/:id/location
- POST /api/blog-images
- POST /api/blog-posts
- POST /api/channel-posts
- POST /api/channel-posts/:id/cancel
- POST /api/form
- POST /api/form/step
- POST /api/form/submit
- POST /api/host/exec
- POST /api/nodes/enroll
- POST /api/partner/withdrawals/:id/media
- POST /api/review
- POST /api/review/save
- POST /api/reviews
- POST /api/tickets/:id/media
- POST /api/tickets/:id/messages
- POST /api/trial/claim
- POST /api/trial/offer
- POST /api/web/key
- POST /api/web/key/new
- POST /api/web/trial
- POST /api/yookassa/checkouts
- POST /mcp
- POST /mcp/media
- POST /yoomoney/notify
- PUT /api/channel-posts/:id
- PUT /api/plans/:code
- PUT /api/settings
- PUT /api/storefront

### unreached — вызов есть в приложении с экранами, но ни один экран до него не доходит (9)
- GET /*  ← apps/admin/src/shared/api/queries.ts, apps/node-agent/src/main.ts, apps/node-agent/src/net/docker.ts, scripts/apply-node-cover-sni.ts, scripts/lib/cloudflare-dns.ts, scripts/lib/remnawave-node-api.ts, scripts/probe-user.ts, scripts/provision-marzban-node.ts, scripts/remnawave-e2e.ts
- GET /api/activity/analytics  ← apps/admin/src/shared/api/queries.ts
- GET /api/campaigns  ← apps/admin/src/shared/api/queries.ts
- GET /api/custom-emoji/:name  ← apps/admin/src/shared/api/custom-emoji-queries.ts
- GET /api/forms/:id/responses  ← apps/admin/src/shared/api/form-queries.ts
- GET /api/partners/:telegramId  ← apps/admin/src/shared/api/queries.ts
- GET /api/session  ← apps/admin/src/shared/api/queries.ts
- GET /api/settings  ← apps/admin/src/shared/api/queries.ts
- GET /api/storefront  ← apps/admin/src/shared/api/queries.ts

### no-caller — вебхук: вызывает внешний сервис (4)
- POST /ipc/webhook
- POST /webhook
- POST /webhook/:botId
- POST /yookassa/webhook

### no-caller — бот: вызывает Telegram или бот (3)
- GET /r/:token
- POST /api/web/telegram/link
- POST /api/web/telegram/poll

### other-client — вызывается не из экранов карты: @vpn/miniapp (22)
- POST /api/cards
- POST /api/cards/auto-renew
- POST /api/cards/unlink
- POST /api/devices/revoke
- POST /api/devices/usage
- POST /api/events
- POST /api/history
- POST /api/partner
- POST /api/partner/referrals
- POST /api/partner/withdrawals
- POST /api/partner/withdrawals/:id
- POST /api/partner/withdrawals/:id/messages
- POST /api/partner/withdrawals/create
- POST /api/profile
- POST /api/profile/prefs
- POST /api/promo/quote
- POST /api/refund
- POST /api/refundable
- POST /api/subscription/cancel
- POST /api/tickets
- POST /api/tickets/:id
- POST /api/tickets/create

### other-client — вызывается не из экранов карты: @vpn/miniapp, vpn-saas-node (2)
- POST /api/pay
- POST /api/state

### other-client — вызывается не из экранов карты: site (1)
- GET /api/web/blog-images/:id

### other-client — вызывается не из экранов карты: @vpn/subs (1)
- GET /sub/:token

### other-client — вызывается не из экранов карты: vpn-saas-node (2)
- GET /health
- GET /ready

