# Fonts

Self-hosted rather than loaded from a CDN: no third-party request on render, no
privacy or uptime dependency, and identical rendering on every platform. The
previous stylesheet used Avenir Next and Iowan Old Style, both macOS-only, so
the site rendered as Segoe UI + Georgia on Windows and generic sans/serif on
Linux.

These are the **latin subsets** as served by Google Fonts (`unicode-range`
U+0000–00FF plus common punctuation and symbols), downloaded and committed. To
refresh, request the CSS with a browser user agent and download the URL from
the `/* latin */` block:

| File | Family | Axes / weights | Size |
|---|---|---|---|
| `archivo-var-latin.woff2` | Archivo | variable, `wght` 400–900, `wdth` 62–125% | 90 KB |
| `plex-mono-400-latin.woff2` | IBM Plex Mono | 400 | 10 KB |
| `plex-mono-600-latin.woff2` | IBM Plex Mono | 600 | 10 KB |

Archivo carries both a weight and a width axis in one file, which is why the
masthead can be genuinely expanded rather than letterspaced to imitate it.

## Licensing

Both families are licensed under the **SIL Open Font License 1.1**, which
permits embedding and redistribution in this form.

- Archivo — Omnibus-Type, <https://github.com/Omnibus-Type/Archivo>
- IBM Plex Mono — IBM, <https://github.com/IBM/plex>

`@font-face` declarations live in `src/assets/css/_tokens.scss`. Paths there are
relative to the stylesheet, so they survive any `SITE_BASE_PATH` without going
through the `siteUrl` filter.
