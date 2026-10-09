Feature: Conversation heat
  As the human deciding where to look next
  I want regions classified by whether discussion outlived the spec
  So that intent never nailed down shows up before it turns into re-litigation

  Scenario: Heavy discussion ended by a spec change reads as settled
    Given a region with 40 journal entries before its last spec change and none after
    When a refresh runs
    Then the region is classified settled
    And the region carries no flag in the report

  Scenario: Discussion outliving the last spec change reads as contested
    Given a region with heavy discussion whose last spec change is dated "2026-07-10"
    And journal discussion of that region continuing through "2026-07-19"
    When a refresh runs
    Then the region is classified contested
    And the region carries a hot flag in the report

  Scenario: Heavy discussion with no scenarios reads as uncaptured
    Given a region with 35 journal entries and no scenarios
    When a refresh runs
    Then the region is classified uncaptured
    And the region carries the hottest flag in the report

  Scenario: Little discussion and little spec reads as unexamined
    Given a region with 2 journal entries and 1 unreviewed scenario
    When a refresh runs
    Then the region is classified unexamined
    And the region is reported as unknown rather than hot

  Scenario: Little discussion around a stable reviewed spec reads as quiet
    Given a region with 3 journal entries and 4 reviewed scenarios unchanged since their rulings
    When a refresh runs
    Then the region is classified quiet
    And the region carries no flag in the report

  Scenario: Little discussion around a lapsed review never reads as quiet
    Given a region with 3 journal entries and 4 scenarios marked reviewed-then-changed
    When a refresh runs
    Then the region is not classified quiet
    And the region is reported as unknown rather than hot

  Scenario: Heavy is cut at the natural break in discussion density
    Given regions with 40, 38, 6, 5, and 4 journal entries
    When a refresh runs
    Then only the regions with 40 and 38 entries are classified heavy

  Scenario: A flat distribution withholds heat classification
    Given five regions with 3, 4, 3, 4, and 3 journal entries
    When a refresh runs
    Then no region is classified heavy
    And the report states that no natural break exists and heat classification is withheld

  Scenario: A region is presented in terms a reader can recognize
    Given a region of discussion about refund handling correlated to 2 scenarios
    When the report is emitted
    Then the region is presented by terms drawn from its discussion
    And the 2 correlated scenarios are named alongside it
    And the region cites its journal entries as evidence

  Scenario: An uncaptured region is presented from its discussion alone
    Given a region with 35 journal entries and no scenarios
    When the report is emitted
    Then the region is presented by terms drawn from its discussion
    And the region cites its journal entries as evidence
