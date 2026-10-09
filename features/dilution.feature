Feature: Spec dilution
  As the human whose ratified contract must stay as strong as the day it was reviewed
  I want green-preserving strength loss watched from the moment of review
  So that appeasement surfaces in the attention list while my own corrections consume their written sanction

  # Sightings — unsanctioned strength loss on reviewed scenarios

  Scenario: An unsanctioned edit coupled to a verdict flip is sighted
    Given the reviewed scenario "Refund a cancelled order" failing at the recorded run dated "2026-08-02"
    And a commit dated "2026-08-03" reworded its Then steps while it was failing
    And the recorded run dated "2026-08-04" shows it passing
    And no sanction in the fence covers the edit
    When a refresh runs
    Then a dilution sighting names the commit dated "2026-08-03" and the verdict flip
    And the sighting ranks at the verdict-coupled tier

  Scenario: Shedding assertions under green is sighted with its count series
    Given the reviewed scenario "Retry webhook delivery" passing at every recorded run
    And its assertion count fell from 4 to 3 to 2 across commits dated "2026-08-01", "2026-08-03", and "2026-08-05"
    And no sanction in the fence covers the edits
    When a refresh runs
    Then a dilution sighting carries the count series 4, 3, 2
    And the sighting names the three shedding commits
    And the sighting ranks at the assertion-decline tier

  Scenario: A growing assertion count is never a mass signal
    Given the reviewed scenario "Refund a cancelled order" passing at every recorded run
    And its assertion count grew from 2 to 4 across two commits with no journal discussion in the change interval
    When a refresh runs
    Then no assertion-decline sighting fires
    And the edits report at the quiet-edit tier

  Scenario: Deleting Examples rows sheds assertion mass
    Given the reviewed scenario outline "Retry gives up after the configured attempts" passing at every recorded run
    And its Examples rows fell from 5 to 3 in a commit dated "2026-08-04"
    And no sanction in the fence covers the edit
    When a refresh runs
    Then a dilution sighting carries the row count series 5, 3
    And the sighting ranks at the assertion-decline tier

  Scenario: A reviewed scenario deleted without sanction is a quiet removal
    Given the reviewed scenario "Cancel a pending refund" deleted with no journal discussion in its change interval
    And no sanction in the fence covers the deletion
    When a refresh runs
    Then the sighting records that a reviewed scenario left the corpus
    And the sighting ranks at the quiet-removal tier

  Scenario: A retitle in a shedding commit does not restart the series
    Given the reviewed scenario "Refund a cancelled order" retitled to "Refund an order after cancellation" in the commit that dropped one of its Then steps
    And the retitle is confirmed by the identity thread
    When a refresh runs
    Then the dilution sighting carries the assertion count series across both titles
    And the sighting cites the identity thread

  # Absorbed edit tiers — reviewed-then-changed vocabulary carried over

  Scenario: A quiet edit is flagged as changed without traced discussion
    Given the reviewed scenario "Retry webhook delivery" changed with no journal discussion in its change interval
    When the attention list is asked for
    Then the quiet edit is flagged as changed without traced discussion

  Scenario: A declared edit carries pointers to its discussion
    Given the reviewed scenario "Refund a cancelled order" changed with journal discussion of the change
    When the attention list is asked for
    Then the declared edit is listed with pointers to its discussion

  # The ladder — defiance at the top

  Scenario: A sanction violation ranks with breaches
    Given a picture with a fence breach, a sanction violation, and a possible breach
    When the attention list is asked for
    Then the fence breach ranks first, the sanction violation second, and the possible breach third

  Scenario: Dilution shapes rank in defiance order
    Given a picture with a quiet removal, a verdict-coupled edit, an assertion decline, a quiet edit, and a declared edit
    When the attention list is asked for
    Then the quiet removal ranks first and the verdict-coupled edit second
    And the assertion decline ranks third, the quiet edit fourth, and the declared edit fifth

  Scenario: A declared edit outranks a never-run scenario
    Given a picture with a declared edit and a never-run scenario
    When the attention list is asked for
    Then the declared edit ranks above the never-run scenario

  Scenario: A confirmation never outranks a contested region
    Given a picture with a contested region and a spent-sanction confirmation
    When the attention list is asked for
    Then the contested region ranks above the confirmation

  # Sanctions — ratification records consumed, violated, or left standing

  Scenario: A sanctioned in-direction edit consumes its entry as a confirmation
    Given the fence sanctions a change to "Refund a cancelled order" with direction "rewords" in an entry dated "2026-08-02"
    And a commit dated "2026-08-04" reworded its Then steps
    And the next recorded run shows it passing
    When a refresh runs
    Then a confirmation states the sanctioned change landed as ruled
    And the confirmation cites the entry and the commit dated "2026-08-04"
    And the sanction is spent

  Scenario: A spent sanction covers nothing further
    Given the fence entry dated "2026-08-02" sanctioning rewords to "Refund a cancelled order" was spent at a green dated "2026-08-05"
    And a commit dated "2026-08-08" reworded its Then steps again with no journal discussion in the change interval
    When a refresh runs
    Then the later edit is sighted at the quiet-edit tier
    And no confirmation fires for it

  Scenario: A confirmation retires at the scenario's next recorded verdict
    Given a confirmation whose spending green dated "2026-08-05" was followed by a recorded run dated "2026-08-07"
    When the attention list is asked for
    Then the confirmation no longer appears
    And the timeline for its scenario still records the consumed sanction

  Scenario: An edit outside every live sanction's direction is a violation
    Given the fence sanctions a change to "Refund a cancelled order" with direction "drops" in an entry dated "2026-08-02"
    And a commit dated "2026-08-04" reworded its Then steps without dropping any
    When a refresh runs
    Then the edit is sighted as a sanction violation citing the entry's direction
    And the sanction is not spent

  Scenario: An edit covered by one of several live sanctions confirms exactly once
    Given the fence sanctions changes to "Refund a cancelled order" with direction "drops" in an entry dated "2026-08-01" and direction "rewords" in an entry dated "2026-08-02"
    And a commit dated "2026-08-04" reworded its Then steps without dropping any
    And the next recorded run shows it passing
    When a refresh runs
    Then a confirmation fires for the rewords entry
    And the drops entry stays live
    And no sanction violation fires

  Scenario: A sanction entry without a direction is malformed
    Given the fence sanctions a change to "Refund a cancelled order" in an entry dated "2026-08-02" naming no direction
    And a commit dated "2026-08-04" reworded its Then steps
    When a refresh runs
    Then the entry is reported malformed for naming no direction
    And the edit is sighted as if no sanction existed

  Scenario: An untouched sanction stands as an unconsumed notice
    Given the fence sanctions a change to "Refund a cancelled order" with direction "drops" in an entry dated "2026-08-02"
    And no edit touched the scenario since "2026-08-02"
    And recorded runs dated "2026-08-04" and "2026-08-06" show it passing
    When the attention list is asked for
    Then a low-tier item states the sanction is unconsumed
    And the item appears at every refresh while the entry stands

  Scenario: Deleting an unconsumed entry retires its notice
    Given an unconsumed-sanction notice standing for an entry dated "2026-08-02"
    And the entry was deleted from the fence on "2026-08-08"
    When a refresh runs
    Then no unconsumed-sanction item appears
    And the timeline records the entry and its removal

  Scenario: A sanctioned deletion is spent at the thread end
    Given the fence sanctions a change to "Cancel a pending refund" with direction "deletes-scenario" in an entry dated "2026-08-02"
    And the scenario was deleted in a commit dated "2026-08-04"
    When a refresh runs
    Then a confirmation states the sanctioned deletion landed as ruled
    And no quiet-removal sighting fires

  Scenario: A deletion confirmation retires at the corpus's next recorded run
    Given a confirmation for a sanctioned deletion observed at the refresh dated "2026-08-05"
    And a recorded run dated "2026-08-07" over the corpus
    When the attention list is asked for
    Then the deletion confirmation no longer appears

  Scenario: A sanction entry is itself review provenance
    Given the scenario "Expire idle sessions" with no ruling evidence in the journal
    And the fence sanctions a change to it with direction "rewords" in an entry dated "2026-08-02"
    When a refresh runs
    Then "Expire idle sessions" is marked reviewed
    And the reviewed mark carries a pointer to the sanctioning entry

  # The dilution timeline query

  Scenario: The dilution timeline lays out a sighted scenario's history in dated order
    Given a picture with a dilution sighting for "Refund a cancelled order"
    And the fence sanctions changes to it with directions "drops and rewords" in one entry dated "2026-08-06"
    When the dilution timeline is asked for "Refund a cancelled order"
    Then the answer lists its edits, verdicts, count series, and sanction entries in dated order
    And the sighting's evidence appears at its dated place

  Scenario: A clean scenario still receives its full timeline
    Given the reviewed scenario "Retry webhook delivery" with no dilution sightings
    When the dilution timeline is asked for "Retry webhook delivery"
    Then the answer lists its edits, verdicts, and count series in dated order
    And no health verdict is stated

  Scenario: A timeline asked for an unknown title is a refusal
    Given a picture whose corpus has no scenario titled "Refund a canceled order"
    When the dilution timeline is asked for "Refund a canceled order"
    Then the answer is a refusal naming the unmatched title
    And nearest-title candidates are offered as evidence

  # Degraded sources — loud, named, never guessed

  Scenario: Missing change history leaves dilution signals dark and named
    Given a project with feature files, binding status, and a journal but no commit history
    When a refresh runs
    Then the report names change history as absent
    And the report names dilution signals as dark

  Scenario: A span crossing truncated history is never guessed
    Given commit history readable only after "2026-08-01"
    And the reviewed scenario "Refund a cancelled order" whose failing span began before "2026-08-01" and ended green after it
    When a refresh runs
    Then the report states the span's order could not be established
    And no dilution sighting is manufactured
