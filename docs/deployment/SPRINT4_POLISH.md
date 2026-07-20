# Sprint 4 — Polish Checklist

Focus: Company Portal + onboarding (not full redesign).

## Loading & empty states

- [x] `lazyLoader.js` shows skeleton before module import (`showModuleSkeleton`)
- [x] Portal modules use `renderEmptyState` with CTAs when data = 0
- [x] Dashboard uses widget skeletons via hub prefetch

## Error handling

- [x] `js/shared/apiRequest.js` — `registerApiErrorToast()` for 5xx/network errors
- [x] Portal `main.js` registers `showToast` on bootstrap

## Onboarding go-live

- [x] Enhanced complete step: checklist, company name, portal CTA link
- [x] CSS: success animation (respects `prefers-reduced-motion`)

## Company portal CSS

- [x] Mobile sidebar drawer (existing BOS hamburger + `.open`)
- [x] 44px minimum tap targets on nav, buttons, hamburger
- [x] Nav/quick-action transitions with reduced-motion override
- [x] Typography spacing on KPI values and page content

## Files changed

| File | Change |
|------|--------|
| `css/company-portal.css` | Tap targets, motion, typography |
| `css/onboarding.css` | Go-live success screen |
| `js/onboarding/main.js` | Complete step content |
| `js/shared/apiRequest.js` | Error toast hook |
| Portal modules | Empty states + error panels |

## Follow-ups (not in scope)

- Shared design tokens across admin + portal
- Sarah chat raw fetch → apiRequest migration
- Full appointments UI polish
