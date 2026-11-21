# korbor-all: роуты без экранов (после)

Собрано `routeScreenGap` по maps/korbor-all.liveappmap.json: 114 из 314.
unreached — вызов в приложении с экранами есть, но экран до него не доходит (оболочка входа, мёртвый код);
other-client — вызывает не экран карты (mobile, call-core, сервисы); no-caller — вызова в репозитории нет.

### no-caller — в коде репозитория вызова нет (59)
- DELETE /api/v1/admin/reports/broadcasts/:id
- DELETE /api/v1/admin/reports/comments/:id
- DELETE /api/v1/admin/reports/templates/:id
- DELETE /api/v1/employer/vacancy-templates/personal/:id
- DELETE /api/v1/recruiter/feed-presets/personal/:id
- DELETE /api/v1/recruiter/vacancies/:vacancyId/favorite
- GET /api/v1/admin/candidate-locks
- GET /api/v1/admin/candidates
- GET /api/v1/admin/candidates/:candidateId/messages
- GET /api/v1/admin/candidates/:candidateId/resume-url
- GET /api/v1/admin/feed-presets/:id
- GET /api/v1/admin/price-categories/:id
- GET /api/v1/admin/risk-events
- GET /api/v1/admin/system-settings/:key/audit
- GET /api/v1/admin/vacancy-templates/:id
- GET /api/v1/calls/:callId/notes
- GET /api/v1/config/public
- GET /api/v1/deals/:dealId/reviews
- GET /api/v1/disputes
- GET /api/v1/disputes/:id
- GET /api/v1/employer/candidates/:candidateId
- GET /api/v1/employer/chat/threads/:candidateId
- GET /api/v1/employer/vacancies/:vacancyId/candidates
- GET /api/v1/employer/vacancies/:vacancyId/payment-handoff
- GET /api/v1/employer/vacancy-templates
- GET /api/v1/employer/vacancy-templates/personal
- GET /api/v1/legal/documents/:code/file
- GET /api/v1/recruiter/applications/:id
- GET /api/v1/recruiter/candidates/:candidateId
- GET /api/v1/recruiter/candidates/:candidateId/attachments/sign
- GET /api/v1/recruiter/candidates/:candidateId/messages
- GET /api/v1/recruiter/candidates/:candidateId/resume-url
- GET /api/v1/recruiter/chat/threads
- GET /api/v1/recruiter/chat/threads/:candidateId
- GET /api/v1/recruiter/feed-presets/personal
- GET /api/v1/recruiter/support/messages
- GET /api/v1/users/:userId/reviews
- PATCH /api/v1/recruiter/feed-presets/personal/:id
- POST /api/v1/activity/batch
- POST /api/v1/admin/anti-bypass-claims/:id/resolve
- POST /api/v1/admin/chat/reports/:reportId/resolve
- POST /api/v1/admin/deals/:dealId/refund-tranche2
- POST /api/v1/admin/marketmaker/bulk-assign
- POST /api/v1/admin/registry/:name/:id/actions/:action
- POST /api/v1/admin/users/:id/rating-recalc
- POST /api/v1/deals/:dealId/reviews
- POST /api/v1/employer/deals/:dealId/confirm-replacement
- POST /api/v1/employer/deals/:dealId/report-left
- POST /api/v1/employer/vacancy-templates/personal
- POST /api/v1/recruiter/candidates/:candidateId/chat-reports
- POST /api/v1/recruiter/candidates/:candidateId/chat-uploads
- POST /api/v1/recruiter/candidates/:candidateId/messages
- POST /api/v1/recruiter/candidates/:candidateId/resume/confirm
- POST /api/v1/recruiter/candidates/:candidateId/resume/presign-upload
- POST /api/v1/recruiter/deals/:dealId/replacement-candidates
- POST /api/v1/recruiter/feed-presets/personal
- POST /api/v1/recruiter/locks/:lockId/claims
- POST /api/v1/recruiter/support/messages
- POST /api/v1/recruiter/support/read

### unreached — вызов есть в приложении с экранами, но ни один экран до него не доходит (18)
- GET /api/v1/auth/admin/me  ← apps/admin/src/features/auth/model/session-store.ts
- GET /api/v1/auth/web/providers  ← apps/miniapp/src/features/auth/web-api-client.ts
- GET /api/v1/auth/web/session  ← apps/miniapp/src/features/auth/web-api-client.ts
- GET /api/v1/dev/dogfood/actors  ← apps/miniapp/src/app/WebDogfoodPicker.tsx
- GET /api/v1/legal/status  ← apps/miniapp/src/features/consent/api-client.ts
- PATCH /api/v1/me/locale  ← apps/miniapp/src/features/auth/api-client.ts
- POST /api/v1/auth/admin/login  ← apps/admin/src/features/auth/model/session-store.ts
- POST /api/v1/auth/admin/logout  ← apps/admin/src/features/auth/model/session-store.ts
- POST /api/v1/auth/admin/refresh  ← apps/admin/src/features/auth/model/session-store.ts
- POST /api/v1/auth/telegram/miniapp  ← apps/miniapp/src/features/auth/api-client.ts, scripts/.tmp-token.ts, scripts/db-query-budget/run.ts, scripts/diag-initdata-auth.ts, scripts/load-test/actors.ts, scripts/load-test/run.ts
- POST /api/v1/auth/web/login  ← apps/miniapp/src/features/auth/web-api-client.ts
- POST /api/v1/auth/web/password/forgot  ← apps/miniapp/src/features/auth/web-api-client.ts
- POST /api/v1/auth/web/password/reset  ← apps/miniapp/src/features/auth/web-api-client.ts
- POST /api/v1/auth/web/refresh  ← apps/miniapp/src/features/auth/web-api-client.ts
- POST /api/v1/auth/web/register  ← apps/miniapp/src/features/auth/web-api-client.ts
- POST /api/v1/auth/web/telegram-login  ← apps/miniapp/src/features/auth/web-api-client.ts
- POST /api/v1/dev/dogfood/session  ← apps/miniapp/src/app/WebDogfoodPicker.tsx
- POST /api/v1/me/notifications/read  ← apps/miniapp/src/features/notifications/api-client.ts

### no-caller — бот: вызывает Telegram или бот (9)
- GET /api/v1/internal/bot/intake/active
- POST /api/v1/auth/app/telegram/start
- POST /api/v1/internal/bot/app-login/bind
- POST /api/v1/internal/bot/app-login/decide
- POST /api/v1/internal/bot/intake/:sessionId/abandon
- POST /api/v1/internal/bot/intake/:sessionId/answer
- POST /api/v1/internal/bot/intake/:sessionId/back
- POST /api/v1/internal/bot/intake/:sessionId/edit-step
- POST /api/v1/internal/bot/intake/start

### other-client — вызывается не из экранов карты: @korbor/mobile (5)
- DELETE /api/v1/me/push-tokens
- GET /api/v1/me
- POST /api/v1/auth/app/telegram/poll
- POST /api/v1/calls/:callId/invite-peer
- POST /api/v1/me/push-tokens

### no-caller — вход и сессия: вызывает оболочка или внешний вход (6)
- GET /api/v1/auth/sessions
- GET /api/v1/auth/web/google/start
- POST /api/v1/auth/app/google/exchange
- POST /api/v1/auth/app/google/start
- POST /api/v1/auth/logout
- POST /api/v1/auth/logout-all

### no-caller — вебхук: вызывает внешний сервис (3)
- GET /api/v1/auth/app/google/callback
- GET /api/v1/auth/web/google/callback
- POST /api/v1/calls/livekit/webhook

### other-client — вызывается не из экранов карты: @korbor/mobile, @korbor/call-core (2)
- POST /api/v1/calls/:callId/end
- POST /api/v1/calls/join

### other-client — вызывается не из экранов карты: @korbor/call-core (9)
- GET /api/v1/calls/:callId/assistant
- GET /api/v1/calls/:callId/assistant/segments
- GET /api/v1/calls/:callId/transcript
- POST /api/v1/calls/:callId/ask
- POST /api/v1/calls/:callId/events
- POST /api/v1/calls/:callId/guest-link
- POST /api/v1/calls/:callId/invite
- POST /api/v1/calls/:callId/transcript
- PUT /api/v1/calls/:callId/notes

### other-client — вызывается не из экранов карты: @korbor/call-transcriber (1)
- POST /api/v1/internal/calls/:callId/transcript

### other-client — вызывается не из экранов карты: @korbor/site (1)
- POST /api/v1/error-reports

### other-client — вызывается не из экранов карты: korbor-platform (1)
- POST /api/v1/webhooks/ipc

