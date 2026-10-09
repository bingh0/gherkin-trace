Feature: Reporting to the human
  As the human reading one artifact per refresh
  I want a report that opens with what matters and re-emits byte-identically
  So that a git diff of committed reports is always real drift and never rendering noise

  Scenario: The report opens with the attention list
    Given a picture holding a fence breach and 2 orphans
    When the report is emitted
    Then the attention list is the first section of the report

  Scenario: The report's attention section matches the attention list answer
    Given a picture with a fence breach and an orphan
    When the report is emitted and the attention list is asked for
    Then the report's attention section lists the same items in the same order as the answer

  Scenario: The report carries the review and coverage state
    Given a picture with 8 reviewed scenarios, 1 reviewed-then-changed scenario, 2 orphans, and a contested region
    When the report is emitted
    Then the report states the reviewed set holds 8 scenarios
    And the report lists the reviewed-then-changed scenario, both orphans, and the contested region

  Scenario: The report states its inputs
    Given a picture built by a refresh
    When the report is emitted
    Then the report states the refresh time
    And the report states the sources read
    And the report states the tool version that emitted it

  Scenario: Re-emitting over an unchanged picture is byte-identical
    Given a report emitted over a picture
    When the report is emitted again with no source changes and no new refresh
    Then the two reports are byte-identical

  Scenario: A refresh over unchanged sources changes only the stated refresh time
    Given a report emitted and committed after a refresh
    When a new refresh runs over byte-identical sources and the report is emitted
    Then the two reports differ only in the stated refresh time

  Scenario: No report comes from a failed refresh
    Given a refresh that failed partway through
    When a report is asked for
    Then no report is emitted
    And the refusal states that the last refresh failed
