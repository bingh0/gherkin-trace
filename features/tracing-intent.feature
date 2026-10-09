Feature: Tracing intent
  As an agent authoring design scenarios
  I want to look up how any scenario connects to declared intent
  So that mechanics nobody asked for and intent nobody refined are both visible

  Scenario: The exception view lists orphans and unrefined intent
    Given a UAT scenario "Refund a cancelled order" with no design scenario refining it
    And a design scenario "Retry webhook delivery" with no traceable UAT parent
    When the exception view is asked for
    Then "Retry webhook delivery" is listed as an orphan
    And "Refund a cancelled order" is listed as unrefined
    And scenarios with intact links are not listed

  Scenario: A downward lookup lists refinements with binding status
    Given a UAT scenario "Refund a cancelled order" refined by 3 design scenarios
    When the downward lookup asks what refines it
    Then the 3 design scenarios are listed
    And each listed scenario shows its binding status

  Scenario: An upward lookup names the intent behind a design scenario
    Given a design scenario "Reject a refund above the original amount" refining the UAT scenario "Refund a cancelled order"
    When the upward lookup asks what intent it traces to
    Then "Refund a cancelled order" is named with its review status

  Scenario: The neighborhood view gathers everything around a scenario
    Given a design scenario with a UAT parent, 2 sibling design scenarios, journal discussion, and an adjacent fence ruling
    When the neighborhood view is asked for
    Then the view shows the UAT parent
    And the view shows both siblings with their binding status
    And the view shows the journal discussion
    And the view shows the adjacent fence ruling

  Scenario: An empty neighborhood names each absence
    Given a design scenario with a UAT parent, no sibling design scenarios, no journal discussion, and no adjacent fence ruling
    When the neighborhood view is asked for
    Then the sibling slot states it is the sole refinement of its intent
    And the journal slot states the scenario is unexamined
    And the fence slot states no adjacent ruling was found as of the refresh time

  Scenario: Every trace answer carries freshness
    Given a picture refreshed at "2026-07-27 14:10"
    When any trace lookup answers
    Then the answer states the refresh time "2026-07-27 14:10"
    And the answer states whether any source changed since that time

  Scenario: A lookup miss returns near matches and freshness
    Given a picture holding a scenario titled "Refund a cancelled order"
    When a lookup asks for a title the picture does not contain
    Then the answer states the title is not in the picture as of the refresh time
    And the closest titles the picture does hold are offered
    And the answer states whether any source changed since the refresh

  Scenario: An orphan neighborhood offers candidate parents with evidence
    Given an orphan design scenario whose journal discussion mentions the UAT scenario "Refund a cancelled order"
    When the neighborhood view is asked for
    Then the parent slot states that no intent is traced
    And "Refund a cancelled order" is offered as a candidate parent citing the journal evidence

  Scenario Outline: A <direction> lookup at the <tier> tier reorients the asker
    Given a <tier> scenario
    When the <direction> lookup is asked
    Then the answer states the scenario sits at the <tier> tier
    And the answer offers the <useful> lookup instead

    Examples:
      | direction | tier   | useful   |
      | upward    | UAT    | downward |
      | downward  | design | upward   |
