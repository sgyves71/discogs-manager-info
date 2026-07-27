<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Discogs Manager</title>
  <style>
    body {
      margin: 0; padding: 48px 24px; min-height: 100vh; box-sizing: border-box;
      background: #111318; color: #eef1f5;
      font: 17px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    main { max-width: 760px; margin: auto; }
    article {
      padding: 42px; border: 1px solid #4b5563; border-radius: 18px;
      background: #1a1f27;
    }
    .eyebrow { color: #9ab6d8; font-size: 13px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    h1 { font-size: 42px; line-height: 1.15; margin: 8px 0 16px; }
    h2 { margin-top: 32px; font-size: 20px; }
    p, li { color: #c7d0dc; }
    footer { margin-top: 32px; color: #9aa6b5; font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <article>
      <div class="eyebrow">Private, local-first project</div>
      <h1>Discogs Manager</h1>

      <p>Discogs Manager is a personal application for cataloging, organizing, and appraising a private CD collection. It runs locally on its owner’s home computer and is not a public marketplace, storefront, or consumer-facing service.</p>

      <h2>What it does</h2>
      <ul>
        <li>Builds a searchable catalog of a personal CD collection.</li>
        <li>Identifies releases by artist, album title, barcode, and catalog number.</li>
        <li>Uses Discogs catalog data to associate each physical CD with its specific release information.</li>
        <li>Stores collection details locally, including release year, country, label, catalog number, condition, and personal notes.</li>
        <li>Allows corrections when a CD is initially matched to the wrong release.</li>
        <li>Supports phone-based barcode scanning over the owner’s home network.</li>
      </ul>

      <h2>Market-value research</h2>
      <p>The owner may use relevant market listing data to help estimate collection value. Catalog-number matching is used where available to improve the relevance of CD listing searches. The project is intended for personal collection management and appraisal research only.</p>

      <h2>Privacy and security</h2>
      <p>This public page exists only to describe the project. The application itself, collection database, scanned barcode data, account credentials, and personal collection information remain private and are not hosted on this site.</p>

      <footer>Discogs Manager is a private, non-commercial personal-use project.</footer>
    </article>
  </main>
</body>
</html>
