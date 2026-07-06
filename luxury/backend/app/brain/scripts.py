"""Waiter Script Generator — generates recommendation scripts in three tones.

Tones: professional | friendly | luxury
"""

from __future__ import annotations


class WaiterScriptGenerator:
    """Generates targeted waiter scripts for pairings and upsells."""

    @staticmethod
    def generate_scripts(
        source_name: str,
        target_name: str,
        target_category: str,
        base_reason: str = "",
        type_hint: str = "pairing",
    ) -> dict[str, str]:
        """Produce scripts in three distinct tones.

        Uses pre-authored reasons when available, otherwise falls back to
        NLG templates.
        """
        # Clean up reason if provided
        reason_sentence = base_reason.strip()
        if reason_sentence and not reason_sentence.endswith("."):
            reason_sentence += "."

        category_clean = target_category.lower()

        # ── Pairing scripts ───────────────────────────────────────────────────
        if type_hint == "pairing":
            if reason_sentence:
                # Authored reason exists
                professional = f"To pair with the {source_name}, I highly recommend the {target_name}. {reason_sentence}"
                friendly = f"If you're having the {source_name}, the {target_name} is a fantastic choice. {reason_sentence}"
                luxury = f"May I suggest pairing your {source_name} with the {target_name}. {reason_sentence}"
            else:
                # Heuristic fallback scripts based on drink category
                if "wine" in category_clean or "red" in category_clean or "white" in category_clean:
                    professional = f"To pair with the {source_name}, I recommend a glass of {target_name} to complement the dish's profile."
                    friendly = f"You should try the {target_name} with your {source_name} — the flavors go together beautifully."
                    luxury = f"To elevate your course, may I present the {target_name} — an exceptional selection structured to frame the nuances of the {source_name}."
                else:
                    professional = f"To accompany the {source_name}, we suggest our {target_name} as a refreshing pairing."
                    friendly = f"The {target_name} is a really nice, crisp match with the {source_name}."
                    luxury = f"For the ultimate pairing, we recommend our {target_name} to create a sophisticated flavor harmony alongside your {source_name}."

        # ── Upgrade/Upsell scripts ────────────────────────────────────────────
        elif type_hint == "upgrade":
            if "wagyu" in target_name.lower():
                professional = f"We also offer the Wagyu A5 Ribeye for an elevated steak experience with incomparable marbling."
                friendly = f"If you're celebrating tonight, you've got to try the Wagyu Ribeye — it literally melts in your mouth."
                luxury = f"Should the occasion call for the extraordinary, our Wagyu A5 Ribeye represents the absolute peak of Japanese beef craft. The marbling is incomparable."
            else:
                professional = f"For a more premium selection, I would recommend upgrading to our signature {target_name}."
                friendly = f"If you want to treat yourself, our {target_name} is a step up and absolutely worth it."
                luxury = f"To fully experience the depth of our kitchen's craft, I invite you to consider the {target_name} — a truly remarkable expression of this cut."

        # ── Replacement scripts ───────────────────────────────────────────────
        else:
            professional = f"As a close alternative to the {source_name}, our {target_name} offers a very similar profile."
            friendly = f"Since we're out of the {source_name}, the {target_name} is a great substitute with the same flavor profile."
            luxury = f"To maintain the culinary layout of your evening, may I offer our {target_name} as a seamless alternative to the {source_name}."

        return {
            "professional": professional,
            "friendly": friendly,
            "luxury": luxury,
        }
