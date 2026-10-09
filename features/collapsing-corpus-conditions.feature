Feature: Collapsing corpus conditions
  As the human reading diagnostics over a corpus at scale
  I want a condition that holds corpus-wide stated once, with its members kept
  So that one systemic fact never buries every other diagnostic

  Scenario: Corpus-wide provenance saturation is one condition, not hundreds of notes
    Given a corpus of 8 scenarios whose every title saturates provenance mining
    When a refresh runs
    Then exactly one saturation condition forms, naming 8 of 8 mined titles and the 500-result bound
    And the condition keeps all 8 affected titles and nothing else
    And no per-scenario saturation note appears
    And the attention answer names the saturation as a limitation

  Scenario: Three saturated titles stay itemized
    Given a corpus where 3 of 8 scenario titles saturate provenance mining
    When a refresh runs
    Then exactly the 3 saturated titles carry their own saturation notes
    And no corpus-level saturation condition forms

  Scenario: A fourth saturated title crosses into collapse
    Given a corpus where 4 of 8 scenario titles saturate provenance mining
    When a refresh runs
    Then exactly one saturation condition forms, naming 4 of 8 mined titles
    And no per-scenario saturation note appears

  Scenario: Mass quarantine is rolled up by cause
    Given 12 feature files of which 9 fail to parse for 2 distinct reasons
    When a refresh runs twice
    Then exactly one rollup condition states that 9 of 12 feature files are quarantined
    And the cause counts read 5 and 4 with both causes named
    And all 9 quarantined files remain individually named with their own errors
    And both refreshes state the identical condition

  Scenario: Three quarantined files stay itemized
    Given 12 feature files of which 3 fail to parse
    When a refresh runs
    Then no rollup condition forms
    And the 3 files are named as exceptions

  Scenario: A corpus with no design tier is one fact, not a flood
    Given a corpus of 40 declared-intent scenarios with no design tier, one of them never run
    When the attention list is asked for
    Then no unrefined-intent item appears
    And the answer states the design tier is absent and refinement ranking is unavailable for 40 scenarios
    And the never-run scenario still ranks

  Scenario: A quarantined design tier is a parse problem, never tier absence
    Given a corpus whose only design feature file fails to parse
    When the attention list is asked for
    Then no design-tier-absence condition forms
    And the declared-intent scenarios rank as unrefined
    And the design file is named as an exception

  Scenario: A corpus with a design tier keeps per-scenario refinement ranking
    Given a corpus with a design tier where 3 declared-intent scenarios are unrefined
    When the attention list is asked for
    Then each of the 3 unrefined scenarios appears in the list
    And no design-tier-absence condition forms

  Scenario: The report states corpus conditions in their own census
    Given a corpus of 40 declared-intent scenarios with no design tier, one of them never run
    When the report is emitted
    Then the report's conditions census carries the design-tier statement
    And the report's notes carry no duplicate of it
