Feature: Surviving renames
  As the owner of a corpus agents reorganize freely
  I want trace links and review status to follow scenarios through moves and retitles
  So that reorganization never silently severs provenance

  Scenario: Links survive a move and a retitle
    Given the scenario "Refund a cancelled order" linked to a UAT parent and journal discussion
    When the scenario moves to another file and is retitled "Refund an order after cancellation" with its body untouched
    And a refresh runs
    Then the link to the UAT parent is intact
    And the link to the journal discussion is intact

  Scenario: The former title stays visible in history
    Given the scenario "Refund an order after cancellation" formerly titled "Refund a cancelled order"
    When the neighborhood view is asked for
    Then the former title "Refund a cancelled order" is visible in the scenario's history

  Scenario: Review survives a pure rename
    Given a reviewed scenario "Refund a cancelled order"
    When the scenario moves to another file and is retitled "Refund an order after cancellation" with its body untouched
    And a refresh runs
    Then the scenario is still marked reviewed

  Scenario: An unconfirmable rename breaks visibly with candidates
    Given the scenario "Refund a cancelled order" no longer exists
    And a similar scenario "Refund an order after cancellation" appeared in another file without a confirmable rename
    When a refresh runs
    Then the old scenario's history is closed
    And the new scenario starts unreviewed with no traced intent
    And the report notes the broken thread
    And "Refund a cancelled order" is offered as a rename candidate with its evidence

  Scenario: A user ruling confirming a rename heals the broken thread
    Given a broken thread offering "Refund a cancelled order" as a rename candidate
    And a user-authored journal ruling confirming the rename dated "2026-07-20"
    When a refresh runs
    Then the new scenario carries the old scenario's history
    And the journal links follow
    And the reconnection cites the ruling

  Scenario: Deleting a reviewed scenario is reported, never silent
    Given a reviewed scenario "Refund a cancelled order"
    When the scenario is deleted with no similar scenario appearing
    And a refresh runs
    Then the scenario's history is closed
    And the report names the deleted scenario as reviewed intent removed
