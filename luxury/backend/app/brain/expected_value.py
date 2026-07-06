"""Expected Value Engine — computes expected revenue boost of suggestions.

Formula: Expected Value = Target Price * Probability of Acceptance
"""

from __future__ import annotations


class ExpectedValueEngine:
    """Calculates Expected Value to prioritize financially optimal recommendations."""

    @staticmethod
    def calculate_expected_value(price: float, confidence: float, relation_tier: str) -> float:
        """Calculate the expected financial value of a recommendation.

        Acceptance probability is derived from confidence and pairing tier:
        - hero: high baseline probability (e.g. 0.40)
        - strong: medium baseline probability (e.g. 0.25)
        - fallback/alternative: low baseline probability (e.g. 0.15)
        """
        # Baseline probability based on pairing strength
        if relation_tier == "hero":
            base_p = 0.40
        elif relation_tier == "strong":
            base_p = 0.25
        elif relation_tier == "prestige":
            base_p = 0.20
        else:
            base_p = 0.12

        # P(Acceptance) is scaled sharply by confidence to reward high-confidence pairings
        probability = base_p * (0.3 + (0.7 * confidence))

        # Clamp probability between 0.05 and 0.95 for realistic EV
        probability = max(0.05, min(0.95, probability))

        return round(price * probability, 2)
