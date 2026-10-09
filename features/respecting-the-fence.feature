Feature: Respecting the fence
  As the human who said no on the record
  I want declined scope treated as first-class negative intent
  So that fenced silence is explained and fenced territory is guarded

  Scenario: Fenced silence cites the ruling
    Given a fence ruling declining partial refunds dated "2026-06-12"
    And no scenarios about partial refunds
    When the report is emitted
    Then partial refunds is not reported as under-covered
    And the suppression cites the fence ruling

  Scenario: User discussion after the ruling reads as fence-under-pressure
    Given a fence ruling declining partial refunds dated "2026-06-12"
    And user-authored journal discussion of partial refunds dated "2026-07-02"
    When a refresh runs
    Then partial refunds is flagged fence-under-pressure
    And the flag asks for the ruling to be reconsidered or reaffirmed

  Scenario: A harness notification never rings the reconsider bell
    Given a fence ruling declining partial refunds dated "2026-06-12"
    And a harness notification dated "2026-07-02" whose text discusses partial refunds
    When a refresh runs
    Then partial refunds is not flagged fence-under-pressure

  Scenario: A reaffirmed ruling clears fence-under-pressure
    Given a fence ruling declining partial refunds dated "2026-06-12"
    And user-authored journal discussion of partial refunds dated "2026-07-02"
    And a ruling reaffirming the fence dated "2026-07-10"
    When a refresh runs
    Then partial refunds is not flagged fence-under-pressure
    And the fence stands on the ruling dated "2026-07-10"

  Scenario: A scenario inside fenced territory reads as a breach
    Given a fence ruling declining partial refunds dated "2026-06-12"
    And a scenario "Refund half of an order" added on "2026-07-15" clearly inside that territory
    When a refresh runs
    Then "Refund half of an order" is reported as a fence breach
    And the breach outranks every other item in the attention list

  Scenario: A scenario predating the fence ruling still reads as a breach
    Given a scenario "Refund half of an order" that existed before "2026-06-12"
    And a fence ruling declining partial refunds dated "2026-06-12"
    When a refresh runs
    Then "Refund half of an order" is reported as a fence breach
    And the breach notes that the scenario predates the ruling

  Scenario: An arguable match reads as a breach candidate
    Given a fence ruling declining partial refunds
    And a fence ruling declining invoice adjustment after delivery
    And a scenario "Adjust an invoice after the order ships" whose match to the adjustment ruling is arguable
    When a refresh runs
    Then "Adjust an invoice after the order ships" is reported as a possible breach
    And the possible breach cites both the scenario and the adjustment ruling
    And possible breaches rank above pressure signals and below confirmed breaches

  Scenario: A named guardian is cited, never a breach
    Given a fence ruling declining partial refunds dated "2026-06-12"
    And the fence names "Refunds stop at the full amount" as a guardian of that ruling
    And a scenario "Refunds stop at the full amount" added on "2026-07-15" clearly inside that territory
    When a refresh runs
    Then "Refunds stop at the full amount" is not reported as any breach
    And the picture cites the guardianship of the fence ruling

  Scenario: The fence is found beside the feature files first
    Given a fence ruling declining partial refunds kept beside the feature files
    When a refresh runs
    Then the picture reads the fence from "features/OUT-OF-SCOPE.md"

  Scenario: A fence in both places reads from beside the features and names the shadowed root
    Given a fence ruling declining partial refunds kept beside the feature files
    And a fence ruling declining invoice adjustment after delivery
    When a refresh runs
    Then the picture reads the fence from "features/OUT-OF-SCOPE.md"
    And a note names the shadowed fence at "OUT-OF-SCOPE.md"

  Scenario: A missing fence file leaves fence signals dark and named
    Given a project with no out-of-scope list
    When a refresh runs
    Then the report names fence signals as dark
