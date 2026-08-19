# health-intake-api

Serverless API behind the Wellspring health assessment.

```
intake.html  ->  POST /api/submit  ->  Claude  ->  private repo  ->  emailed token link
                 GET  /api/report?r=<rid>      one report, by unguessable token
                 POST /api/lookup              a client's own reports, by initials + DOB
                 GET  /api/admin               full index, server-checked key
```

## Why this changed

Reports used to be committed to the **public** `product-marketing` repo and served by
GitHub Pages at `reports/<INITIALS>_<DOB>_<DATE>.html`. That made every client's report
readable by anyone who guessed the URL, and `reports/index.json` published the full
client list (names, dates of birth, health signals) with no authentication at all.
The admin passcode was a string in public HTML, so it withheld nothing.

Now: report HTML lives in a **private** repo, is fetched server-side only, and is
addressed by a 24-character random token that exists only in the link you send.

## Environment variables (Vercel -> Settings -> Environment Variables)

| Name | Value |
|---|---|
| `GITHUB_TOKEN` | A **fresh** fine-grained PAT with Contents: read/write on `health-reports` only |
| `ANTHROPIC_API_KEY` | unchanged |
| `REPORTS_REPO` | `johnnnyay/health-reports` |
| `ADMIN_KEY` | `pN6nn5HGtDp-HnoP5vy95J2eHvoVt3lr` |
| `API_BASE` | `https://health-intake-api.vercel.app` |
| `INTAKE_SECRET` | optional, unchanged |

The `ADMIN_KEY` above was generated for you. It is your new admin.html passcode.
Do not commit it anywhere.

## Deploy order

1. Create private repo `Johnnnyay/health-reports`, push the contents of
   `~/Developer/health-reports` (11 migrated reports + index.json).
2. Set the environment variables above in Vercel and redeploy this project.
3. Push the patched `my-report.html` and `admin.html` to `product-marketing`.
4. **Delete `reports/` from `product-marketing` and push.** Until this step lands, the
   old public copies are still readable.
5. Confirm `https://johnnnyay.github.io/product-marketing/reports/index.json` returns 404.

## Note on the old links

Any report link you have already emailed points at the public path and will 404 after
step 4. `MIGRATION_MAP.txt` in the health-reports repo maps every old filename to its
new token so you can resend.
