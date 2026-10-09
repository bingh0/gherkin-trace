Feature: Routing attention
  As the human with minutes, not hours
  I want one ranked list of what deserves my eyes
  So that scarce attention lands on defects before pressure and never on manufactured urgency

  Scenario: One ranked list with evidence per item
    Given a picture with a fence breach, an orphan, and a contested region
    When the attention list is asked for
    Then the breach ranks first, the orphan second, and the contested region third
    And each item cites its evidence

  Scenario: A never-run scenario outranks an orphan
    Given a picture with a never-run scenario and an orphan
    When the attention list is asked for
    Then the never-run scenario ranks above the orphan

  Scenario: An empty list means empty
    Given a picture with no breaches, no orphans, no unrefined intent, and no pressure signals
    When the attention list is asked for
    Then the list is empty
    And the answer states the refresh time
    And no item is manufactured to fill the list

  Scenario: An empty list names what it could not see
    Given a picture with no defects and no pressure signals
    And heat classification withheld for lack of a natural break
    When the attention list is asked for
    Then the list is empty
    And the answer states that heat classification was withheld
    And no item is manufactured to fill the list

  Scenario: Exception overflow is grouped, never truncated
    Given 400 orphan design scenarios across 12 feature files
    When the attention list is asked for
    Then all 400 orphans are listed, grouped by feature file
    And the group summary names the largest cluster

  Scenario: A signal pile-up appears once at its top tier with all evidence
    Given the scenario "Refund half of an order" that is a possible breach, contested, and unreviewed
    When the attention list is asked for
    Then the scenario appears exactly once, in the possible-breach tier
    And the contested and unreviewed signals are listed beneath it with their evidence
    And the lower tiers state how many items were absorbed above

  Scenario: Equal-rank items order deterministically
    Given two orphans of equal rank in the files "billing.feature" and "payments.feature"
    When the attention list is asked for twice over an unchanged picture
    Then both lists are byte-identical
    And the orphans are ordered by file path then title
