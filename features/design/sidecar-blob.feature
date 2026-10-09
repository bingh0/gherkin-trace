# Design tier: v1 conformance of the blob gt emits, against ccr's
# docs/PANE-CONTRACT.md and its golden fixture docs/pane-blob.golden.json.
# The UAT tier (features/sidecar-blob.feature) pins the behavior; this file
# pins the bytes the seam's other side will parse.

Feature: Sidecar blob v1 conformance
  As the builder binding gt's half of the pane-blob seam
  I want the emitted blob pinned to the pane contract's exact shape
  So that ccr's schema-blind renderer and gt's emitter can never drift apart

  Scenario: The blob is a v1 pane blob with every required field
    Given a picture built by a refresh
    Then the blob file is .gherkin-trace/sidecar.json
    And the blob parses as JSON with v equal to the number 1
    And tool reads "gherkin-trace" and title reads "trace"
    And status reads "ok" and basis carries label "refresh" and the refresh time in at
    And rows is an array whose every value field is a JSON string

  Scenario: The blob matches the golden fixture's shape
    Given a picture built by a refresh
    Then the blob carries exactly the fields the pane contract's golden fixture carries
    And no field beyond the v1 contract is required for a consumer to render it

  Scenario: Attention tiers map onto the closed status enum
    Given a picture with a fence breach
    When a refresh runs
    Then the attention row's status reads "alert"
    Given a picture whose attention list is empty with nothing dark
    When a refresh runs
    Then the attention row's status reads "ok"

  Scenario: A failed refresh emits the broken shape
    Given a sidecar blob written by a successful refresh
    When a refresh fails partway through
    Then status reads "broken" and message is a non-empty string
    And basis is present with the failed attempt's time in at
    And rows is an empty array

  Scenario: Blob strings carry no control bytes even when sources do
    Given a feature file whose parse error embeds a control byte in its message
    When a refresh runs
    Then no string field anywhere in the blob contains a control byte

  Scenario: The blob directory and write are owner-only and same-directory atomic
    Given a picture built by a refresh
    Then the blob's directory is created owner-only
    And the blob is written aside in that same directory and renamed into place

  Scenario: The blob is written after the refresh record
    Given a picture built by a refresh
    Then the blob's write follows the refresh record's write
    And a blob is never newer than the picture it describes

  Scenario: No spark rides on any row
    Given a picture built by a refresh
    Then no row in the blob carries a spark field
