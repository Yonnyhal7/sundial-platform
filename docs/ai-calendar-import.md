# AI calendar PDF import deployment

Configure these server environment variables in every environment that runs the calendar import route:

```dotenv
OPENAI_API_KEY=
OPENAI_CALENDAR_TEXT_MODEL=gpt-5.6-sol
OPENAI_SCHEDULE_PDF_MODEL=gpt-5.6-sol
```

`OPENAI_CALENDAR_TEXT_MODEL` controls locally extracted-text analysis and `OPENAI_SCHEDULE_PDF_MODEL` controls direct, layout-aware PDF analysis. Both default to `gpt-5.6-sol`. They are intentionally server-only: do not rename them with a `NEXT_PUBLIC_` prefix or expose them to client code. The browser cannot select or override either model.

Every intentional upload starts a fresh analysis. The legacy `ai_calendar_analysis_cache` table remains in place only for in-flight attempt ownership, progress polling, and short-lived refresh recovery; completed results are never reused by a later request.

Keep real API keys in the deployment provider's encrypted environment settings. Never commit them to this repository.
