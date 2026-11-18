// Nepali (Bikram Sambat) calendar for the Frappe desk.
//
// Values are always stored as AD ("YYYY-MM-DD"). The display mode comes from
// Nepali Calendar Settings / the user's "Date Display" field (frappe.boot.nepali_calendar):
//   Both - AD with BS alongside; Date fields get a "BS" picker button and a BS hint.
//   BS   - dates are shown in BS everywhere; Date fields are typed in BS (YYYY-MM-DD)
//          and open the BS picker on focus. Datetime fields keep AD input with a BS hint.
//   AD   - stock Frappe behaviour.
//
// Covered: form fields, read-only values, list view, Report View, query reports, table rows,
// filters, the calendar view. Public helpers: frappe.nepali_calendar.*

import {
	NepaliDate, MONTH_KEYS, BS_YEARS, MIN_BS_YEAR, MAX_BS_YEAR,
	ad_to_bs, bs_to_ad, bs_iso, parse_bs, days_in_month,
} from "./bs.js";

const WEEKDAYS = {
	en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
	np: ["आ", "सो", "मं", "बु", "बि", "शु", "श"],
};
const NP_DIGITS = "०१२३४५६७८९";

// Field containers where an extra line under the input or a button would break the layout.
const SKIP_CONTAINERS = ".page-form, .filter-box, .filter-area, .standard-filter-section, .grid-row, .form-grid, .list-row";

const mode = () => frappe.boot?.nepali_calendar?.date_display || "Both";
const lang = () => (frappe.boot?.lang === "ne" ? "np" : "en");
const digits = (n) => (lang() === "np" ? String(n).replace(/\d/g, (d) => NP_DIGITS[d]) : String(n));
const month_name = (m) => new NepaliDate(MIN_BS_YEAR, m, 1).format("MMMM", lang());

/** NepaliDate -> "2 Mangsir 2083" (Devanagari when the user's language is Nepali). */
const bs_text = (nd) => (nd ? nd.format("D MMMM YYYY", lang()) : "");

/** NepaliDate -> "2 Mangsir 2083 BS" / "२ मंसिर २०८३ वि.सं.". */
function format_bs(nd) {
	if (!nd) return "";
	return lang() === "np" ? `${bs_text(nd)} वि.सं.` : `${bs_text(nd)} BS`;
}

frappe.provide("frappe.nepali_calendar");
Object.assign(frappe.nepali_calendar, {
	ad_to_bs, bs_to_ad, bs_iso, parse_bs, format_bs, days_in_month, get_mode: mode,
});

// ---------------------------------------------------------------------------
// 1. Formatters: list view, Report View, query reports, grid cells, read-only form values,
//    filter pills, kanban cards ... everything that goes through frappe.format().
//    Output stays plain text, because some callers insert it with .text().

/** Combine the stock AD text with the BS date according to the display mode. */
function with_bs(ad_text, nd, time = "") {
	if (!ad_text || !nd || mode() === "AD") return ad_text;
	if (mode() === "BS") return time ? `${bs_text(nd)} ${time}` : bs_text(nd);
	return `${ad_text} (${bs_text(nd)})`;
}

const formatters = frappe.form.formatters;
const orig_format_date = formatters.Date;
formatters.Date = function (value, ...args) {
	return with_bs(orig_format_date.call(this, value, ...args), ad_to_bs(value));
};

const orig_format_datetime = formatters.Datetime;
formatters.Datetime = function (value, ...args) {
	const ad_text = orig_format_datetime.call(this, value, ...args);
	if (!value || !ad_text) return ad_text;
	// The stock formatter shows the user's timezone, so convert that date, not the stored one.
	const local = frappe.datetime.convert_to_user_tz(value);
	const time = ad_text.includes(" ") ? ad_text.slice(ad_text.indexOf(" ") + 1) : "";
	return with_bs(ad_text, ad_to_bs(local), time);
};

const orig_format_date_range = formatters.DateRange;
formatters.DateRange = function (value, ...args) {
	if (mode() === "AD" || !Array.isArray(value)) return orig_format_date_range.call(this, value, ...args);
	return __("{0} to {1}", [formatters.Date(value[0]), formatters.Date(value[1])]);
};

// ---------------------------------------------------------------------------
// 2. Date fields

/** In BS mode, plain Date fields are typed and shown in BS. */
const is_bs_input = (control) => mode() === "BS" && control.df?.fieldtype === "Date";

function in_skipped_container(control) {
	return !control.$wrapper || control.$wrapper.closest(SKIP_CONTAINERS).length > 0;
}

/** Hint under editable inputs: BS in "Both" mode (and for Datetime in "BS" mode), AD for BS inputs. */
function update_hint(control, value) {
	if (!control.$input_wrapper || in_skipped_container(control)) return;
	let $hint = control.$input_wrapper.children(".nc-bs-hint");
	const editable = control.get_status?.() === "Write";
	let text = "";
	if (editable && mode() !== "AD" && ["Date", "Datetime"].includes(control.df.fieldtype)) {
		const nd = ad_to_bs(value);
		if (is_bs_input(control)) {
			text = nd && value ? `${frappe.datetime.str_to_user(String(value).slice(0, 10))} AD` : "";
		} else {
			text = format_bs(nd);
		}
	}
	if (!text && !$hint.length) return;
	if (!$hint.length) {
		$hint = $('<div class="nc-bs-hint"></div>').insertBefore(control.$input_wrapper.children(".help-box"));
	}
	$hint.text(text);
}

function add_picker_button(control) {
	if (mode() !== "Both" || control.df.fieldtype !== "Date" || in_skipped_container(control)) return;
	const $area = $(control.input_area);
	if ($area.find(".nc-bs-btn").length) return;
	$area.addClass("nc-has-bs-btn");
	$(`<button type="button" class="nc-bs-btn" title="${__("Pick a Bikram Sambat (BS) date")}">${lang() === "np" ? "वि.सं." : "BS"}</button>`)
		.appendTo($area)
		.on("mousedown", (e) => e.preventDefault()) // keep focus handling off the input
		.on("click", (e) => {
			e.stopPropagation();
			BSPicker.toggle(control);
		});
}

function bind_bs_input(control) {
	control.$input.attr("placeholder", control.df.placeholder || __("YYYY-MM-DD (BS)"));
	control.$input.on("focus click", () => BSPicker.open(control, { keep_focus: true }));
	control.$input.on("input", () => {
		const ad = parse_bs(control.$input.val());
		if (ad && BSPicker.control === control) BSPicker.show_month_of(ad);
	});
	control.$input.on("blur", () => {
		// Clicking a select inside the picker moves focus there; keep the picker open then.
		setTimeout(() => {
			if (BSPicker.control === control && !BSPicker.contains(document.activeElement)) BSPicker.close();
		}, 150);
	});
}

/**
 * BS-input fields don't create Frappe's AirDatepicker. Some Frappe/ERPNext code talks to
 * control.datepicker directly (hide(), selectDate(), update({minDate, maxDate})), so give it a
 * small stand-in that routes those calls to the BS picker / control.
 */
function make_datepicker_stub(control) {
	return {
		visible: false,
		selectedDates: [],
		opts: {},
		show() { BSPicker.open(control, { keep_focus: true }); },
		hide() { if (BSPicker.control === control) BSPicker.close(); },
		update(opts = {}) { Object.assign(this.opts, opts); },
		selectDate(date, opts = {}) {
			if (opts.silent) return; // Frappe calls this silently to sync its own picker state
			const first = Array.isArray(date) ? date[0] : date;
			if (first) control.set_value(moment(first).format("YYYY-MM-DD"));
		},
		setViewDate() {},
		clear(opts = {}) { if (!opts.silent) control.set_value(""); },
		destroy() {},
	};
}

const proto = frappe.ui.form.ControlDate.prototype;

const orig_set_datepicker = proto.set_datepicker;
proto.set_datepicker = function (...args) {
	if (is_bs_input(this)) {
		this.datepicker = make_datepicker_stub(this);
		return;
	}
	return orig_set_datepicker.apply(this, args);
};

const orig_make_input = proto.make_input;
proto.make_input = function (...args) {
	const result = orig_make_input.apply(this, args);
	if (is_bs_input(this)) bind_bs_input(this);
	else add_picker_button(this);
	return result;
};

const orig_format_for_input = proto.format_for_input;
proto.format_for_input = function (value, ...args) {
	if (is_bs_input(this) && value) {
		const nd = ad_to_bs(value);
		if (nd) return bs_iso(nd);
	}
	return orig_format_for_input.call(this, value, ...args);
};

const orig_parse = proto.parse;
proto.parse = function (value, ...args) {
	if (!is_bs_input(this) || !value) return orig_parse.call(this, value, ...args);
	// Frappe also runs parse() over values that are already stored (e.g. in get_status());
	// those are AD and must pass through untouched.
	if (value === this.value || value === this.get_model_value?.()) return value;
	const ad = parse_bs(value);
	if (ad) return ad;
	// Not "YYYY…": treat it as an AD date in the user's own date format (e.g. 18-11-2026).
	if (!/^\s*[0-9०-९]{4}/.test(String(value))) return orig_parse.call(this, value, ...args);
	// Unchanged text (e.g. a stored date outside the BS range, shown in AD). Use this.value, not
	// get_value(): for editable fields get_value() calls parse() and would recurse.
	if (this.value && value === this.format_for_input(this.value)) return this.value;
	frappe.show_alert(
		{ message: __("{0} is not a valid BS date. Use YYYY-MM-DD, e.g. 2083-08-02.", [frappe.utils.escape_html(value)]), indicator: "orange" },
		5
	);
	// Keep the previous value rather than clearing the field on a typo; put its text back.
	const previous = this.value || "";
	setTimeout(() => this.$input?.val(previous ? this.format_for_input(previous) : ""));
	return previous;
};

const orig_set_formatted_input = proto.set_formatted_input;
proto.set_formatted_input = function (value, ...args) {
	const result = orig_set_formatted_input.call(this, value, ...args);
	update_hint(this, this.value || value);
	return result;
};

const orig_set_disp_area = proto.set_disp_area;
proto.set_disp_area = function (value, ...args) {
	const result = orig_set_disp_area.call(this, value, ...args);
	update_hint(this, value); // read-only: clears the hint; the formatter already shows BS
	return result;
};

// ---------------------------------------------------------------------------
// 3. BS month picker (one shared popover)

const BSPicker = {
	$el: null,
	control: null,
	keep_focus: false,
	view: null, // { year, month }

	contains(el) {
		return !!(el && this.$el && this.$el[0].contains(el));
	},

	toggle(control) {
		if (this.control === control && this.$el?.is(":visible")) return this.close();
		this.open(control);
	},

	open(control, { keep_focus = false } = {}) {
		this.ensure_el();
		if (this.control === control && this.$el.is(":visible")) return;
		this.control = control;
		this.keep_focus = keep_focus;
		// AirDatepicker.hide() throws if the picker was never shown, so only close it when open.
		if (control.datepicker?.visible) control.datepicker.hide();
		// control.value is the stored AD value (get_value() would re-parse the typed text).
		const selected = ad_to_bs(control.value);
		const start = selected || ad_to_bs(frappe.datetime.get_today()) || new NepaliDate(MAX_BS_YEAR, 0, 1);
		this.view = { year: start.getYear(), month: start.getMonth() };
		this.render();
		this.$el.show();
		this.position();
		if (!keep_focus) this.$el.find(".nc-day.nc-selected, .nc-day.nc-today").first().trigger("focus");
	},

	close() {
		this.$el?.hide();
		this.control = null;
	},

	show_month_of(ad) {
		const nd = ad_to_bs(ad);
		if (!nd) return;
		this.view = { year: nd.getYear(), month: nd.getMonth() };
		this.render();
	},

	ensure_el() {
		if (this.$el) return;
		this.$el = $('<div class="nc-bs-picker" role="dialog"></div>').hide().appendTo(document.body);
		// Typing BS inputs keep focus while the picker is used (except its selects).
		this.$el.on("mousedown", (e) => {
			if (this.keep_focus && !$(e.target).is("select, option")) e.preventDefault();
		});
		this.$el.on("click", "[data-action]", (e) => {
			const action = e.currentTarget.dataset.action;
			if (action === "prev") this.shift(-1);
			if (action === "next") this.shift(1);
			if (action === "today") this.select_ad(frappe.datetime.get_today());
			if (action === "clear") this.select_ad("");
		});
		this.$el.on("click", ".nc-day[data-ad]", (e) => this.select_ad(e.currentTarget.dataset.ad));
		this.$el.on("change", "select", () => {
			this.view = {
				year: Number(this.$el.find(".nc-year").val()),
				month: Number(this.$el.find(".nc-month").val()),
			};
			this.render();
		});
		// On document, not the popover: re-rendering the month drops focus out of the popover.
		$(document).on("keydown.nc_bs_picker", (e) => {
			if (e.key !== "Escape" || !this.$el.is(":visible")) return;
			e.stopPropagation(); // don't also close a surrounding dialog
			this.close();
		});
		$(document).on("mousedown.nc_bs_picker", (e) => {
			if (!this.$el.is(":visible")) return;
			if ($(e.target).closest(".nc-bs-picker, .nc-bs-btn").length) return;
			if (this.control && e.target === this.control.$input?.[0]) return;
			this.close();
		});
		$(window).on("resize.nc_bs_picker", () => this.close());
		$(document).on("scroll.nc_bs_picker", (e) => {
			if (this.$el.is(":visible") && !$(e.target).closest(".nc-bs-picker").length) this.position();
		});
		$(document).on("page-change", () => this.close());
	},

	shift(delta) {
		let { year, month } = this.view;
		month += delta;
		if (month < 0) [year, month] = [year - 1, 11];
		if (month > 11) [year, month] = [year + 1, 0];
		if (year < MIN_BS_YEAR || year > MAX_BS_YEAR) return;
		this.view = { year, month };
		this.render();
	},

	select_ad(ad) {
		const control = this.control;
		this.close();
		if (control) control.set_value(ad);
	},

	limits() {
		const df = this.control.df;
		const opts = this.control.datepicker?.opts || {};
		const iso = (d) => (d ? moment(d).format("YYYY-MM-DD") : null);
		return { min: iso(df.min_date || opts.minDate), max: iso(df.max_date || opts.maxDate) };
	},

	render() {
		const { year, month } = this.view;
		const today_ad = frappe.datetime.get_today();
		const selected_ad = this.control.value ? String(this.control.value).slice(0, 10) : null;
		const first_weekday = new NepaliDate(year, month, 1).getDay();
		const { min, max } = this.limits();

		const month_options = MONTH_KEYS.map(
			(_, m) => `<option value="${m}" ${m === month ? "selected" : ""}>${month_name(m)}</option>`
		).join("");
		const year_options = BS_YEARS.map(
			(y) => `<option value="${y}" ${y === year ? "selected" : ""}>${digits(y)}</option>`
		).join("");

		let cells = "";
		for (let i = 0; i < first_weekday; i++) cells += '<span class="nc-day nc-empty"></span>';
		for (let d = 1; d <= days_in_month(year, month); d++) {
			const ad = bs_to_ad(year, month, d);
			const classes = ["nc-day"];
			if (ad === today_ad) classes.push("nc-today");
			if (ad === selected_ad) classes.push("nc-selected");
			const disabled = (min && ad < min) || (max && ad > max) || this.control.df.disabled_dates?.includes(ad);
			cells += `<button type="button" class="${classes.join(" ")}" ${disabled ? "disabled" : `data-ad="${ad}"`}
				title="${frappe.datetime.str_to_user(ad)}">
				<span class="nc-bs-num">${digits(d)}</span><span class="nc-ad-num">${moment(ad).date()}</span>
			</button>`;
		}

		const at_min = year === MIN_BS_YEAR && month === 0;
		const at_max = year === MAX_BS_YEAR && month === 11;
		this.$el.html(`
			<div class="nc-head">
				<button type="button" class="nc-nav" data-action="prev" ${at_min ? "disabled" : ""} aria-label="${__("Previous month")}">‹</button>
				<select class="nc-month" aria-label="${__("Month")}">${month_options}</select>
				<select class="nc-year" aria-label="${__("Year")}">${year_options}</select>
				<button type="button" class="nc-nav" data-action="next" ${at_max ? "disabled" : ""} aria-label="${__("Next month")}">›</button>
			</div>
			<div class="nc-grid">
				${WEEKDAYS[lang()].map((w) => `<span class="nc-weekday">${w}</span>`).join("")}
				${cells}
			</div>
			<div class="nc-foot">
				<button type="button" class="btn btn-xs btn-default" data-action="today">${__("Today")}</button>
				<span class="nc-ad-range">${frappe.datetime.str_to_user(bs_to_ad(year, month, 1))} – ${frappe.datetime.str_to_user(bs_to_ad(year, month, days_in_month(year, month)))}</span>
				<button type="button" class="btn btn-xs btn-default" data-action="clear">${__("Clear")}</button>
			</div>
		`);
	},

	position() {
		if (!this.control?.$input) return;
		const input = this.control.$input[0].getBoundingClientRect();
		const el = this.$el[0];
		const height = el.offsetHeight;
		const width = el.offsetWidth;
		const below = window.innerHeight - input.bottom >= height + 4 || input.top < height + 4;
		const top = below ? input.bottom + 4 : input.top - height - 4;
		const left = Math.min(Math.max(input.left, 8), window.innerWidth - width - 8);
		el.style.top = `${top}px`;
		el.style.left = `${left}px`;
	},
};

// ---------------------------------------------------------------------------
// 4. Calendar view (FullCalendar): BS day numbers in month cells, BS dates in week/day
//    column headers, and the BS month range next to the title.

function bs_range_title(start, end_exclusive) {
	const first = ad_to_bs(start);
	const last = ad_to_bs(new Date(end_exclusive.getTime() - 86400000));
	if (!first || !last) return "";
	const part = (nd) => `${month_name(nd.getMonth())} ${digits(nd.getYear())}`;
	if (first.getYear() === last.getYear() && first.getMonth() === last.getMonth()) return part(first);
	if (first.getYear() === last.getYear()) return `${month_name(first.getMonth())} – ${part(last)}`;
	return `${part(first)} – ${part(last)}`;
}

if (frappe.views?.Calendar) {
	const cal_proto = frappe.views.Calendar.prototype;
	const orig_setup_options = cal_proto.setup_options;
	cal_proto.setup_options = function (...args) {
		const result = orig_setup_options.apply(this, args);
		if (mode() === "AD") return result;
		const options = this.cal_options;

		const orig_day_cell = options.dayCellDidMount;
		options.dayCellDidMount = (info) => {
			orig_day_cell?.(info);
			const nd = ad_to_bs(info.date);
			const top = info.el.querySelector(".fc-daygrid-day-top");
			if (!nd || !top) return;
			const label = nd.getDate() === 1 ? `${digits(1)} ${month_name(nd.getMonth())}` : digits(nd.getDate());
			$(`<span class="nc-cal-bs" title="${frappe.utils.escape_html(format_bs(nd))}"></span>`).text(label).prependTo(top);
		};

		const orig_day_header = options.dayHeaderDidMount;
		options.dayHeaderDidMount = (info) => {
			orig_day_header?.(info);
			if (info.view.type.startsWith("dayGrid")) return; // month view headers are weekday names
			const nd = ad_to_bs(info.date);
			if (nd) $('<div class="nc-cal-bs-header"></div>').text(bs_text(nd)).appendTo(info.el.querySelector(".fc-scrollgrid-sync-inner") || info.el);
		};

		const orig_dates_set = options.datesSet;
		options.datesSet = (info) => {
			const ret = orig_dates_set?.(info);
			// currentStart/End is the period in the title; start/end includes padding days of the grid.
			const bs_title = bs_range_title(info.view.currentStart, info.view.currentEnd);
			if (bs_title && this.$toolbar_title) {
				this.$toolbar_title.find(".es-button__label").text(`${info.view.title} · ${bs_title}`);
			}
			return ret;
		};
		return result;
	};
}
