"""Receipt / screenshot extraction.

Vision-to-structured-data: given a receipt image (or a screenshot of page state)
and the fields we want, Gemma reads the document and returns the values. In the
expense demo this auto-fills the amount/vendor/date variables from an attached
receipt instead of asking the user to retype them — the "it understands the
document, not just the form" beat.

Same single-interface contract: runs on Cerebras/Gemma, the Anthropic fallback,
or the offline mock.
"""
from __future__ import annotations

from typing import Any

from llm import LLMClient
from .prompts import EXTRACTOR_SYSTEM

_DEFAULT_FIELDS = ["vendor", "date", "amount", "currency", "category"]


class ReceiptExtractor:
    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    def extract(
        self,
        image: bytes,
        fields: list[str] | None = None,
        *,
        expected: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Return the requested fields read from the image, plus `confidence`.

        `expected` is only used by the offline mock to simulate a read; real
        providers ignore it and actually look at the image.
        """
        fields = fields or _DEFAULT_FIELDS
        user = (
            "Extract these fields from the attached document image: "
            f"{', '.join(fields)}.\n"
            "Return one JSON key per field (null if unreadable) plus a numeric "
            "`confidence`. Normalise amounts to plain numbers and dates to YYYY-MM-DD."
        )
        hint = {"role": "extractor", "fields": fields, "expected": expected}
        result = self.llm.vision_json(EXTRACTOR_SYSTEM, user, images=[image], hint=hint)
        result.setdefault("confidence", 0.0)
        return result

    def to_variables(self, extracted: dict[str, Any], mapping: dict[str, str]) -> dict[str, Any]:
        """Map extracted document fields onto workflow variable names.

        e.g. mapping={"amount": "amount", "vendor": "vendor", "date": "expense_date"}
        turns a receipt read into values ready for `bind_variables`.
        """
        out: dict[str, Any] = {}
        for doc_field, var_name in mapping.items():
            if extracted.get(doc_field) not in (None, ""):
                out[var_name] = extracted[doc_field]
        return out
