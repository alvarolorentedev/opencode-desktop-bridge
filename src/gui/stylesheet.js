"use strict"

module.exports = `
.odb { display: flex; flex-direction: column; gap: 14px; }
.odb-muted { opacity: .68; font-size: 12px; line-height: 1.4; }
.odb-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 9px 0; }
.odb-row-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.odb-row-title { font-weight: 500; }
.odb-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.odb-input { font: inherit; color: inherit; background: transparent; border: 1px solid color-mix(in srgb, currentColor 22%, transparent); border-radius: 6px; padding: 4px 8px; min-width: 90px; }
.odb-input:focus { outline: 2px solid color-mix(in srgb, currentColor 35%, transparent); outline-offset: 1px; }
.odb-button { font: inherit; color: inherit; background: color-mix(in srgb, currentColor 8%, transparent); border: 1px solid color-mix(in srgb, currentColor 22%, transparent); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.odb-button:hover { background: color-mix(in srgb, currentColor 14%, transparent); }
.odb-button:disabled { opacity: .5; cursor: default; }
.odb-list { display: flex; flex-direction: column; gap: 7px; }
.odb-item { display: flex; align-items: center; gap: 8px; min-width: 0; }
.odb-item-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.odb-code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; word-break: break-all; }
.odb-card { border: 1px solid color-mix(in srgb, currentColor 16%, transparent); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.odb-link { font: inherit; color: inherit; background: none; border: none; text-decoration: underline; cursor: pointer; padding: 0; }
.odb-warning { border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 8px; padding: 8px 10px; font-size: 12px; }
.odb-error { color: color-mix(in srgb, #d33 70%, currentColor); font-size: 12px; }
.odb-tag { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; opacity: .6; }
`
