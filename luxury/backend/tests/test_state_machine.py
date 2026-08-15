"""Tests for the Dining State Machine."""

from __future__ import annotations


from app.schemas.dining import DiningState, VALID_TRANSITIONS


class TestDiningStateTransitions:
    """Validate the state machine transition rules."""

    def test_all_states_defined(self):
        """Every DiningState enum value has a transition rule."""
        for state in DiningState:
            assert state in VALID_TRANSITIONS

    def test_welcome_can_go_to_aperitif_or_starters(self):
        allowed = VALID_TRANSITIONS[DiningState.WELCOME]
        assert DiningState.APERITIF in allowed
        assert DiningState.STARTERS in allowed

    def test_aperitif_goes_to_starters(self):
        allowed = VALID_TRANSITIONS[DiningState.APERITIF]
        assert DiningState.STARTERS in allowed
        assert len(allowed) == 1

    def test_starters_goes_to_mains(self):
        allowed = VALID_TRANSITIONS[DiningState.STARTERS]
        assert DiningState.MAINS in allowed
        assert len(allowed) == 1

    def test_mains_can_go_to_dessert_or_digestif(self):
        allowed = VALID_TRANSITIONS[DiningState.MAINS]
        assert DiningState.DESSERT in allowed
        assert DiningState.DIGESTIF in allowed

    def test_dessert_can_go_to_digestif_or_finished(self):
        allowed = VALID_TRANSITIONS[DiningState.DESSERT]
        assert DiningState.DIGESTIF in allowed
        assert DiningState.FINISHED in allowed

    def test_digestif_goes_to_finished(self):
        allowed = VALID_TRANSITIONS[DiningState.DIGESTIF]
        assert DiningState.FINISHED in allowed
        assert len(allowed) == 1

    def test_finished_has_no_transitions(self):
        allowed = VALID_TRANSITIONS[DiningState.FINISHED]
        assert len(allowed) == 0

    def test_no_backward_transitions(self):
        """Verify no state can go back to a previous state."""
        state_order = list(DiningState)
        for i, state in enumerate(state_order):
            for target in VALID_TRANSITIONS[state]:
                target_idx = state_order.index(target)
                assert target_idx > i, f"{state.value} → {target.value} is a backward transition"

    def test_full_journey_path(self):
        """Walk through a complete fine-dining journey."""
        journey = [
            DiningState.WELCOME,
            DiningState.APERITIF,
            DiningState.STARTERS,
            DiningState.MAINS,
            DiningState.DESSERT,
            DiningState.DIGESTIF,
            DiningState.FINISHED,
        ]
        for i in range(len(journey) - 1):
            current = journey[i]
            next_state = journey[i + 1]
            assert next_state in VALID_TRANSITIONS[current], \
                f"Cannot transition {current.value} → {next_state.value}"

    def test_skip_aperitif_journey(self):
        """Some restaurants may skip aperitif — WELCOME → STARTERS."""
        assert DiningState.STARTERS in VALID_TRANSITIONS[DiningState.WELCOME]

    def test_skip_dessert_journey(self):
        """Some guests may skip dessert — MAINS → DIGESTIF."""
        assert DiningState.DIGESTIF in VALID_TRANSITIONS[DiningState.MAINS]
