Feature: Building the picture
  As the owner of a growing scenario corpus
  I want a refresh to project my feature files, binding status, and journal into one picture
  So that every trace answer stands on evidence gathered at a known moment

  Scenario: A refresh links the three sources into one picture
    Given a project with 12 scenarios across 3 feature files
    And binding status for those scenarios
    And a journal holding discussion of those scenarios
    When a refresh runs
    Then the picture links each scenario to its bindings and its journal discussion
    And the report states the refresh time and the sources read

  Scenario: Sources are read and never modified
    Given a project with 3 feature files, binding status, and a journal
    When a refresh runs
    Then every feature file, binding registry, and journal store is byte-for-byte unchanged

  Scenario: Deleting the picture and refreshing rebuilds it identically
    Given a picture built by a refresh
    When the picture is deleted and a refresh runs over unchanged sources
    Then the rebuilt picture is identical to the deleted one

  Scenario: A missing journal degrades the picture loudly
    Given a project with feature files and binding status but no journal
    When a refresh runs
    Then the picture is built from the feature files and binding status
    And the report names the journal as absent
    And the report names heat, provenance, and review status as dark

  Scenario: A journal named without treecontext installed degrades the picture loudly
    Given a project with 3 feature files, binding status, and a journal
    And treecontext is not installed beside gherkin-trace
    When a refresh runs
    Then the picture is built from the feature files and binding status
    And the report names the journal as absent and says treecontext is not installed
    And the report names heat, provenance, and review status as dark

  Scenario: Missing binding status degrades the picture loudly
    Given a project with feature files and a journal but no binding status
    When a refresh runs
    Then the picture is built from the feature files and the journal
    And the report names binding status as absent
    And the report names binding signals as dark

  Scenario: A scenario the runner never saw is flagged, never blank
    Given a corpus scenario absent from the binding status source
    When a refresh runs
    Then the scenario is flagged as never run
    And the flag is distinct from an empty binding column

  Scenario: A binding status source that declares its format is read
    Given a project with 6 scenarios whose binding status opens with its format declaration
    When a refresh runs
    Then the picture links all 6 scenarios to their binding status
    And the declaration adds no scenario and no unmatched row

  Scenario: A binding status source declaring an unknown format fails the refresh loudly
    Given a project whose binding status declares a format this tool does not read
    When a refresh runs
    Then the refresh fails naming the declared format and the format this tool reads
    And the failure names the binding status file

  Scenario: A declared binding status source is joined from its own location
    Given a project whose declared binding status lives in a subdirectory with rows relative to that subdirectory
    When a refresh runs
    Then the picture links all 4 scenarios to their binding status

  Scenario: Missing feature files refuse a refresh
    Given a project with a journal but no feature files
    When a refresh runs
    Then no picture is built
    And the refusal states that feature files are required

  Scenario: An empty corpus is a true stated state
    Given a features directory containing no scenarios
    When a refresh runs
    Then the picture holds zero scenarios
    And the report states zero scenarios with the refresh time

  Scenario: An unparseable feature file becomes a named exception
    Given 3 feature files of which one fails to parse
    When a refresh runs
    Then the picture is built from the 2 files that parse
    And the report names the failing file with its parse error
    And the report states that the failing file's scenarios are absent from the picture

  Scenario: A huge corpus refreshes without size policing
    Given a project with 5000 scenarios
    When a refresh runs
    Then the picture holds all 5000 scenarios
    And the report carries no size warning

  Scenario: A crashed refresh leaves the picture marked broken
    Given a refresh that failed partway through
    When the picture is queried for orphan scenarios
    Then the query is refused
    And the refusal states that the last refresh failed and that a successful refresh restores answers

  Scenario: A second refresh during a running refresh is refused
    Given a refresh that is still running
    When a second refresh is started
    Then the second refresh is refused
    And the refusal names the refresh already running

  Scenario: A query before the first refresh is refused with directions
    Given a project where no refresh has ever run
    When the picture is queried for orphan scenarios
    Then the query is refused
    And the refusal states that no picture exists yet and that a refresh builds one

  Scenario Outline: A request to <request> is refused naming its owner
    Given a picture built by a refresh
    When the tool is asked to <request>
    Then the request is refused
    And the refusal states that <owner>

    Examples:
      | request                              | owner                                                       |
      | edit a feature file to fix an orphan | feature edits belong to the normal BDD flow                 |
      | write a note into the journal        | journal writes belong to treecontext                        |
      | mark a scenario as reviewed          | review status is mined from ruling evidence and never set   |
