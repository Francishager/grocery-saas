# AI Advisor

Deploy both backend and frontend. The backend's existing `npm start` prestart step applies the additive, idempotent advisor schema; Prisma client generation already runs during dependency installation. The same SQL is included as migrations `20260913120000_advisor_memory` and `20260913150000_advisor_creative_tools`. No existing business transactions are changed. The database startup user must be allowed to create tables and add columns. For an alternative startup command, apply these migrations before serving the new API.

Backend environment:

- `NVIDIA_API_KEY`: required for replies, summaries and creative copy. Never set this as a frontend/VITE variable. The visual studio uses stored product photographs or external photographs; it does not call the legacy illustration endpoint.
- `NVIDIA_MODEL`: optional override of the tested default model.
- `BRAVE_SEARCH_API_KEY`: optional for broader public web-search results. Without it, research fetches live business reference extracts from the public MediaWiki API. Reference extracts are not current news or authoritative local law.

Search queries use public business-topic keywords, never customer names, balances, payment details, project instructions or raw chat text. See [MediaWiki TextExtracts](https://www.mediawiki.org/wiki/Extension:TextExtracts) and [Brave Search API](https://api-dashboard.search.brave.com/api-reference/web/search/get).

## Data and access

- Collections, conversations and turns are private to the authenticated tenant and user. Projects can sit inside folders; conversations can be moved between projects/folders.
- AI access requires `canUseBusinessAI` and the Dashboard feature. Business snapshots remain subject to the user's existing data permissions and branch scope.
- Customer context selects only names, reconciled balances and repayment amounts/dates/totals. Customer contact details, payment references and bank/account numbers are excluded.
- HR context uses workforce, attendance and payroll aggregates gated by their separate existing view permissions and subscription features. Employee personal/contact/bank details are excluded.
- Chat access is fingerprinted by current role, permissions, features and branch. Changed access blocks reopening the older conversation and prevents recall of its content; users can start a new chat. Owners do not receive access to another staff user's chats.
- Full message history stays in the database until deleted. Older turns are summarized for model context; recent/relevant prior chats in the current project (or the user's other chats when no project is selected) can also be recalled. The user can disable cross-chat recall and external research per request.
- Summary memory is historical, not a source of current balances. Each reply rebuilds the permitted business snapshot. Very large customer/sales datasets remain bounded with explicit limitations.
- Deleting a conversation removes its messages, summary, ratings and saved visuals/artwork. It does not rewrite information already discussed in other conversations, downloaded files, or backup copies subject to the database backup retention policy. Deleting a folder/project preserves its chats and child projects.
- Browser-only conversations from the previous advisor cannot be recovered after they have been closed; new conversations are saved.

## Verification

`node --test tests/business-advisor.test.js tests/advisor-memory-api.test.js tests/advisor-people-research.test.js tests/advisor-artifacts.test.js tests/advisor-external-photos.test.js`

Frontend: `npm run build`, plus `node --test tests/business-advisor-memory.test.mjs` with Playwright installed or `PLAYWRIGHT_MODULE_PATH` pointing to it. API tests use isolated database/provider fixtures, never production data.

## Feedback and visual studio

- Replies have copy and thumbs-up/down controls. Ratings are saved on completed `advisor_turns` as `feedback` (1, -1, or null) with `feedbackUpdatedAt`. A repeated click clears the rating. Only the conversation's current authorized owner can rate it. Copy conversation loads the full paginated history; copy actions do not send text to an external clipboard service.
- Create visual opens saved flyers, social posts and private visual reports in the current conversation. Users can create a new visual, search permitted products/services, choose channel/size/tone/colors/artwork, edit wording, generate another version, delete it, and download PNG or PDF. Draft captions are copyable. Nothing is posted to social media automatically.
- Marketing receives only the tenant's business name/type/currency, the optional permitted product's name/price/unit/type, and the brief the user explicitly enters. It does not load chat memory, customer records, HR records, or private reports. Users should still avoid typing sensitive data into a marketing brief. The AI provider necessarily receives these permitted inputs; private-by-account is not a claim of zero external processing.
- Automatic artwork prefers the selected product's stored photo, then searches external photographs when it is absent or cannot load. External-photo mode skips the stored photo. Business-product-photo mode and text-only mode never search outside the business. The logo is retained in every mode, with the business name as fallback.
- External image search uses fixed public subject keywords through the [Commons Imageinfo API](https://www.mediawiki.org/wiki/API:Imageinfo). It requires no extra API key. Only CC0 JPEG/WebP candidates with known dimensions, no listed restrictions and no illustration/diagram metadata are considered. Search queries never contain raw briefs, business/customer names, contacts or financial records. Downloads are restricted to the approved HTTPS media hosts, reject redirects, and are bounded by size and time. Network/selection failures are disclosed; they do not prevent text-only output. Representative photos are labeled in the exported design. Source, creator and license details are saved with the image in the existing artifact JSON; no new migration is required. The photo source remains available in the studio.
- The advisor adapts between design, business analysis and investment planning. Sales COGS, gross profit and gross margin are calculated from permitted historical sale data. Missing costs and undefined ratios stay unknown; expenses/net profit are not fabricated. Investment comparisons require stated inputs, time periods, downside scenarios and assumptions. Research selects public design/capital-budgeting topics when relevant. These improvements do not grant access to additional tenant, customer or HR records and do not claim licensed professional status or guaranteed investment returns.
- Creative text requests use the model's documented [JSON response mode](https://docs.nvidia.com/nim/large-language-models/2.0.10/get-started/advanced/get-started-nemotron-3.5-lightning.html) plus server-side shape/length validation. Normal chat continues to use Markdown. AI wording and offers always require human review.
- Reports require `canExportReport` and the corresponding existing module/data permissions and features. Charts, monetary amounts, dates and tables are built from the server's calculated business snapshot, not AI-generated numbers. AI supplies commentary only. Reports include period, branch/user scope, sources and partial-data limitations. Receivable reports contain customer names, balances and repayment totals only; HR reports remain aggregate. These planning snapshots are not audited financial statements.
- `advisor_artifacts` stores metadata, validated report/design JSON, and private raster image bytes (maximum 8 MB per image). Images are served only through authenticated, no-store endpoints with the same tenant/user/access-scope checks. No public image URL is created. Downloaded files are the user's responsibility to protect.
- Request IDs and database leases prevent duplicate generation and allow failed requests to be retried. Provider availability, timeouts and per-user/tenant rate limits still apply. Monitor database storage growth for retained images; normal conversation/visual deletion removes their active stored image bytes.

The browser tests cover five viewport sizes (320, 390, 768, 1024 and 1440 pixels), reload persistence, copy/rating controls, safe Markdown, visual editing, real PNG/PDF downloads, multi-page long-name/large-amount tables and horizontal-overflow checks. Provider smoke tests must use synthetic business data only. No mock content or example visuals are shipped in the application.
