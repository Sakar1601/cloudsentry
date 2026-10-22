# Cloudsentry brand

![Cloudsentry mark](images/logo-tile.svg)

**The mark** is a central "eye" node, the sentry, wired to three agent nodes. The three satellites use the same colors
the UI uses for the agents everywhere else: Cost `#f5a623`, Performance `#a78bfa`, Security `#f2545b`. The eye is the
accent blue `#4da3ff`. The product is the picture: one thing watching, three agents acting on what it sees.

**The wordmark** is "Cloudsentry" in Bricolage Grotesque Bold, tracked slightly tight (`-0.02em`).

| Asset | Use |
|---|---|
| `docs/images/logo-tile.svg` | App icon / avatar: mark on the dark rounded tile. Works on any background. |
| `docs/images/logo-mark.svg` | Mark alone, for dark surfaces. |
| `docs/images/banner.png` | README header. |
| `frontend/app/icon.svg`, `frontend/app/apple-icon.png` | Favicon and touch icon (picked up automatically by Next.js). |
| `frontend/public/og.png` | Social preview image (Open Graph / Twitter card). |
| `frontend/components/Logo.tsx` | `LogoMark` and `Logo` (mark + wordmark) used in the app header, landing nav and footer. |

If the geometry changes, update `Logo.tsx`, `app/icon.svg` and `docs/images/logo-*.svg` together.

The GitHub repository's social preview (Settings → General → Social preview) cannot be set from code; upload
`frontend/public/og.png` there so links to the repo show the same card.
