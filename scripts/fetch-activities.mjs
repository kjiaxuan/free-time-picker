// Downloads the Bored API's activities into public/activities.json.
// The API has no CORS headers, so the browser can't call it; this runs at
// build time (Node has no CORS) and the app reads the static file instead.
// If the download fails, the existing committed file is kept.
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'https://bored-api.appbrewery.com';
const OUT = new URL('../public/activities.json', import.meta.url);

async function getJson(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

try {
  // /filter with no params returns the list; the per-type calls fill in any gaps.
  const types = ['education', 'recreational', 'social', 'diy', 'charity', 'cooking', 'relaxation', 'music', 'busywork'];
  const lists = [await getJson('/filter'), ...(await Promise.all(types.map((t) => getJson(`/filter?type=${t}`))))];
  const byKey = new Map();
  for (const a of lists.flat()) {
    if (a && a.key && a.activity) byKey.set(a.key, a);
  }
  const activities = [...byKey.values()].sort((a, b) => a.activity.localeCompare(b.activity));
  if (activities.length < 20) throw new Error(`only ${activities.length} activities came back`);
  await mkdir(new URL('./', OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(activities, null, 1) + '\n');
  console.log(`Saved ${activities.length} activities to public/activities.json`);
} catch (e) {
  console.error(`Could not refresh activities (${e.message}); keeping the existing file.`);
  process.exitCode = 1;
}
