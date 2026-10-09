Feature: Sidecar blob
  As the owner glancing at a live pane while agents work
  I want each refresh to drop a small status blob beside the picture
  So that a dashboard can render my trace state without ever asking gt anything

  Scenario: A refresh writes the sidecar blob beside the refresh record
    Given a picture built by a refresh
    Then the sidecar blob sits beside the refresh record
    And the blob states the tool name, the schema version, and the refresh time it stands on

  Scenario: Before the first refresh there is no blob at all
    Given a project where no refresh has ever run
    Then no sidecar blob exists
    And no placeholder is written that could read as health

  Scenario: The blob carries what the report carries, from the same picture
    Given a picture with a fence breach, an orphan, and a reviewed scenario
    When a refresh runs
    Then the blob's rows carry the attention count with its top tier
    And the blob's rows carry the reviewed-set count
    And every count in the blob equals the same count in the report

  Scenario: A dark signal family is a dark row, never a clear one
    Given a project with feature files and a journal but no binding status
    When a refresh runs
    Then the blob's binding row carries the dark status
    And no row about a dark family reads as all-clear

  Scenario: Withheld heat is a dark row, not a missing one
    Given a picture whose heat classification is withheld for lack of a natural break
    When a refresh runs
    Then the blob's heat row carries the dark status
    And the heat row states that classification was withheld

  Scenario: A degraded picture cannot look healthy at a glance
    Given 3 feature files of which one fails to parse
    When a refresh runs
    Then the blob's exceptions row states the count of excepted files
    And the exceptions row does not read as all-clear

  Scenario: Suppressed refinement ranking darkens the attention row
    Given a fully run corpus with no design tier
    When a refresh runs
    Then the blob's attention row carries the dark status
    And the attention row states that refinement ranking is dark

  Scenario: A failed refresh poisons the blob loudly
    Given a sidecar blob written by a successful refresh
    When a refresh fails partway through
    Then the blob states that the last refresh failed
    And the blob carries no counts from the earlier picture
    And the blob's stated time is the failed attempt's time

  Scenario: A refused refresh leaves the blob untouched
    Given a sidecar blob written by a successful refresh
    When a second refresh is refused while the first still stands
    Then the blob is byte-identical to the one the successful refresh wrote

  Scenario: Rewriting over unchanged sources changes only the stated refresh time
    Given a sidecar blob written by a refresh
    When a new refresh runs over byte-identical sources
    Then the two blobs differ only in the stated refresh time

  Scenario: A reader never observes a half-written blob
    Given a picture built by a refresh
    When the blob is rewritten by a new refresh
    Then a reader sees either the old blob or the new one, whole
