# opencli-plugin-rubysec

RubySec advisory archive CLI for OpenCLI.

This plugin adds a `rubysec` command group to OpenCLI so you can browse the RubySec advisory archive and read individual vulnerability articles from the terminal.

## Install

Install from GitHub:

```bash
opencli plugin install github:nullptrKey/opencli-plugin-rubysec
```

Install from a local checkout:

```bash
opencli plugin install C:/Users/root/rubysec-opencli-plugin
```

## Commands

List archive entries:

```bash
opencli rubysec archives --limit 10
opencli rubysec archives --year 2026 --limit 5
```

Read a single advisory article:

```bash
opencli rubysec advisory CVE-2026-33946
opencli rubysec advisory https://rubysec.com/advisories/CVE-2026-33946/
```

## Output

- `archives` prints advisory rows including date, ID, gem, title, and URL
- `advisory` returns structured advisory details including severity, patched versions, related links, and the article body

## Notes

- The plugin uses direct HTTP fetching and HTML parsing, so it does not require the OpenCLI Browser Bridge extension
- It targets the public RubySec archive at `https://rubysec.com/advisories/archives/`

## License

Apache-2.0
