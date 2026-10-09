Feature: Answering scripts
  As a CI step that cannot read prose
  I want success, failure, and refusal distinguished by exit code
  So that a pipeline gates on gt without parsing stderr

  Scenario: A refresh that builds the picture exits zero
    Given a project with feature files, binding status, and a journal
    When a refresh runs from the command line
    Then the exit code is 0

  Scenario: A degraded refresh is still an answer and exits zero
    Given a project with feature files but no journal and no binding status
    When a refresh runs from the command line
    Then the exit code is 0
    And the printed summary names the absent sources

  Scenario: A refusal exits two and touches nothing
    Given a project with a journal but no feature files
    When a refresh runs from the command line
    Then the exit code is 2
    And the refusal is printed on stderr
    And no picture directory exists

  Scenario: A refresh that fails partway exits one
    Given a project whose journal store is not a database
    When a refresh runs from the command line
    Then the exit code is 1
    And the failure is printed on stderr
    And the picture on disk is marked broken

  Scenario: A query on a broken picture is a refusal and exits two
    Given a project whose last refresh failed partway
    When the attention list is asked for from the command line
    Then the exit code is 2
    And the refusal is printed on stderr

  Scenario: Queries and the report answer zero over a healthy picture
    Given a project with feature files, binding status, and a journal
    And a refresh has run from the command line
    When the attention list and the report are asked for from the command line
    Then both exit codes are 0
    And both answers arrive on stdout with a clean stderr

  Scenario: A usage error is a refusal, never a failure
    Given a project with feature files, binding status, and a journal
    When an unknown command and a query missing its argument are tried
    Then both exit codes are 2
    And no picture directory exists

  Scenario: Asking for help never runs a refresh
    Given a project with feature files, binding status, and a journal
    When help is asked for alongside a refresh command
    Then the exit code is 0
    And the usage is printed
    And no picture directory exists
