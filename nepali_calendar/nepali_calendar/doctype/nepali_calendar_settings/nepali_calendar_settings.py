import frappe
from frappe.model.document import Document


class NepaliCalendarSettings(Document):
	def on_update(self):
		# Boot info carries the display mode, so refresh it for everyone.
		frappe.clear_cache()
