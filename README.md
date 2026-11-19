# Free Time Picker

Bored in your free time? Get one free browser game to try, then rate whether it was time well spent.

- Games come from the [FreeToGame API](https://www.freetogame.com/api-doc), fetched once in the browser.
- Ratings and history are stored in your browser (localStorage). There is no backend.
- Two metrics: share of slots rated "time well spent" (last 7 days) and share where you picked something within 5 minutes.

## Run locally

```
npm install
npm run dev
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
