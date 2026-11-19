# Free Time Picker

Bored in your free time? Get one thing to try, then rate whether it was time well spent.

- Two suggestion types, switchable with the toggle:
  - **Games:** free browser games from the [FreeToGame API](https://www.freetogame.com/api-doc), fetched live in the browser.
  - **Activities:** general things to do from the Bored API. That API blocks browser requests from other sites, so `scripts/fetch-activities.mjs` downloads it at build time into `public/activities.json` and the app reads that file. The deploy workflow refreshes it weekly.
- Ratings and history are stored in your browser (localStorage). There is no backend.
- Two metrics: share of slots rated "time well spent" (last 7 days) and share where you picked something within 5 minutes.

## Run locally

```
npm install
npm run dev
```

`npm run fetch-activities` refreshes the activity snapshot by hand.

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
