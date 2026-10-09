Feature: Review provenance
  As the human whose attention is the scarce resource
  I want reviewed status mined from ruling evidence in the journal
  So that the reviewed set is credible and never a box someone ticked

  Scenario: Reviewed status comes from mined ruling evidence
    Given journal evidence of a human ruling on the scenario "Refund a cancelled order"
    When a refresh runs
    Then "Refund a cancelled order" is marked reviewed
    And the reviewed mark carries a pointer to the ruling in the journal

  Scenario: A harness notification is never ruling evidence
    Given a harness notification carrying ruling words for the scenario "Refund a cancelled order"
    When a refresh runs
    Then "Refund a cancelled order" is not marked reviewed

  Scenario: The invariant check reports a complete reviewed set
    Given a picture with 8 reviewed scenarios
    And every design scenario traces to a reviewed scenario
    When the invariant check runs
    Then the report states the reviewed set holds 8 scenarios
    And the report states that intent coverage is complete

  Scenario: The invariant check names the scenario that breaks intent coverage
    Given a picture where the design scenario "Retry webhook delivery" traces only to an unreviewed UAT scenario
    When the invariant check runs
    Then the report states that intent coverage is incomplete
    And the report names "Retry webhook delivery"

  Scenario: Ambiguous ruling evidence surfaces as a candidate, not a review
    Given journal discussion mentioning "Refund a cancelled order" alongside a ruling-shaped remark not clearly about it
    When a refresh runs
    Then "Refund a cancelled order" is not marked reviewed
    And the ruling-candidates list carries the remark with its journal pointer

  Scenario: The latest of conflicting rulings decides reviewed status
    Given the scenario "Refund a cancelled order" with a ruling dated "2026-07-18" and a contrary ruling dated "2026-07-26"
    When a refresh runs
    Then the reviewed mark stands on the ruling dated "2026-07-26"
    And both ruling pointers are carried so the conflict can be re-litigated

  Scenario: Review expires when the body changes after the ruling
    Given the scenario "Refund a cancelled order" reviewed by a ruling dated "2026-07-20"
    And its steps changed on "2026-07-25"
    When a refresh runs
    Then the scenario is marked reviewed-then-changed
    And the report carries both the ruling pointer and the change

  Scenario: Unestablishable order falls to reviewed-then-changed
    Given the scenario "Refund a cancelled order" reviewed by a ruling dated "2026-07-25"
    And its steps carry an uncommitted change that could predate or postdate the ruling
    When a refresh runs
    Then the scenario is marked reviewed-then-changed
    And the report states the order of ruling and change could not be established
