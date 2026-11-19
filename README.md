# Free Time Picker

Bored in your free time? Get one free browser game to try, then rate whether it was time well spent.

- Two suggestion types, switchable with the toggle: free browser games from the [FreeToGame API](https://www.freetogame.com/api-doc), and general activities from the Bored API (local only, because that API blocks browser requests from other sites and is reached through the Vite dev proxy).
- Ratings and history are stored in your browser (localStorage). There is no backend.
- Two metrics: share of slots rated "time well spent" (last 7 days) and share where you picked something within 5 minutes.

## Run locally

```
npm install
npm run dev
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
