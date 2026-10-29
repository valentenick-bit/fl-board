# Daily restaurant enrichment

Run once a day. Works for any home pin.

## Steps

1. Read the current home pin (lat, lon) from the board settings or the last known pin.
2. Round lat and lon to 2 decimals. File name is `eats-{lat}_{lon}.json` (example: `eats-41.85_-72.57.json`).
3. Fetch the OSM restaurant list for that pin within 10 miles (restaurant, fast food, cafe, bar, pub, ice cream, food court).
4. For every place on that list, search:
   - Own website: about, menu, reservations vs order online, specials, events
   - Public Yelp / TripAdvisor page text for a rating and category
   - Local happy hour roundups and town food blogs
   - Facebook / Instagram specials and events
   - Existing `deals-{zip}.json` and `events-{zip}.json` so known items are not dropped
5. For each place record only what a source states:
   - kind (Pizza, Mexican, Seafood, Cafe, Coffee, etc.)
   - style (sit-down, takeout, fine dining, fast casual, cafe, bar)
   - rating if found, else null
   - happyHour text if found, else ""
   - deal text if found, else ""
   - events array if found, else []
6. Write the JSON to the fl-board repo as `eats-{lat}_{lon}.json`.
7. Append any dated restaurant events to `events-{zip}.json` so the Events page shows them.

## Rules

- Do not invent a happy hour, deal, or rating.
- One Bite ratings are applied by the board. Do not duplicate them here.
- A new pin with no file yet still shows the OSM list. This run fills the file.
