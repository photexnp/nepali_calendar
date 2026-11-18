### Nepali Calendar

Bikram Sambat (BS) date picker and display for Frappe/ERPNext

Dates are always stored as AD; BS is only used for picking and display. Supported range: BS 2000–2090 (≈ 1943–2034 AD).
Outside that range, dates simply show no BS equivalent.

### Date display modes

Set the default in **Nepali Calendar Settings**; each user can override it with **Date Display** on their
User record (reload after changing).

| Mode | Shown as | Date fields |
| --- | --- | --- |
| **Both** (default) | `18-11-2026 (2 Mangsir 2083)` | AD input, BS hint below, **BS** picker button |
| **BS** | `2 Mangsir 2083` | typed in BS as `YYYY-MM-DD` (e.g. `2083-08-02`), BS picker opens on focus, AD hint below. AD in your date format (e.g. `18-11-2026`) is also accepted |
| **AD** | `18-11-2026` | stock Frappe |

Applies to form fields (editable and read-only), list view, Report View, query reports, table rows, filters,
kanban cards and the calendar view (BS day numbers and BS month range in the title), and print formats.
Datetime and date-range fields keep an AD input (with a BS hint / BS display).

### Features

- **Print formats:** standard and Print Format Builder prints follow the display mode, e.g.
  `18-11-2026 (2 Mangsir 2083 BS)` in Both mode. Only prints change; list views, reports and the API are unaffected.
- **Excel/CSV exports** (Report View and query reports): a `<Label> (BS)` column with `YYYY-MM-DD` BS dates is
  added right after every date column. The AD column stays, so files can be re-imported. Not added in AD mode.
- **Custom Jinja print formats:**

  ```jinja
  {{ bs_date(doc.posting_date) }}                  {# 2 Mangsir 2083 #}
  {{ bs_date(doc.posting_date, "YYYY-MM-DD") }}    {# 2083-08-02  (tokens: YYYY MMMM MM M DD D) #}
  {{ bs_date_label(doc.posting_date) }}            {# 2 Mangsir 2083 BS #}
  ```

- **Client scripts:** `frappe.nepali_calendar.ad_to_bs("2026-11-18")`, `bs_to_ad(2083, 7, 2)` (month index 0 = Baisakh),
  `format_bs(nepali_date)`.
- Users whose language is Nepali (`ne`) get Devanagari digits and month names.

The JavaScript and Python converters share one month-length table, taken from the
[`nepali-date-converter`](https://www.npmjs.com/package/nepali-date-converter) npm package. After upgrading that
package, regenerate `nepali_calendar/bs_data.json` with `node scripts/generate_bs_data.mjs`.

### Tests

```bash
cd apps/nepali_calendar
yarn test                                                        # JavaScript converter
../../env/bin/python -m unittest nepali_calendar.tests.test_bs   # Python converter
```

### Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch develop
bench install-app nepali_calendar
```

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/nepali_calendar
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### License

mit
