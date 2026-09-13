# AI Advisor

Deploy both backend and frontend. The backend's existing `npm start` prestart step applies the additive, idempotent advisor schema; Prisma client generation already runs during dependency installation. The same SQL is included as migration `20260913120000_advisor_memory`. No existing business records are changed.

Backend environment:

- `NVIDIA_API_KEY`: required for replies and long-conversation summaries. Never set this as a frontend/VITE variable.
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
- Deleting a conversation removes its messages and its summary. It does not rewrite information already discussed in other conversations. Deleting a folder/project preserves its chats and child projects.
- Browser-only conversations from the previous advisor cannot be recovered after they have been closed; new conversations are saved.

## Verification

`node --test tests/business-advisor.test.js tests/advisor-memory-api.test.js tests/advisor-people-research.test.js`

Frontend: `npm run build`, plus `node --test tests/business-advisor-memory.test.mjs` with Playwright installed or `PLAYWRIGHT_MODULE_PATH` pointing to it. API tests use isolated database/provider fixtures, never production data.
