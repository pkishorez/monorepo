# DevTools — Context

DevTools is the unified local developer experience for the tools in this
repository. It gives developers one place to access independent tools without
merging their domains.

## Language

**DevTools**:
The umbrella through which developers access all local development tools.
_Avoid_: Tool suite, admin panel.

**Tool**:
A self-contained developer capability presented through DevTools. Telemetry and
Architecture are Tools.

**Tool Scope**:
Whether a Tool works with repository-wide information or information from one
Project.
_Avoid_: Project scope when the Tool is repository-wide.

**Project**:
A source folder selected for analysis by a Project-scoped Tool.
_Avoid_: Workspace when referring to one selected source folder.

**Laymos**:
The domain behind the Architecture Tool. It describes and analyzes the
architecture of a Project.

**lotel**:
The domain behind the Telemetry Tool. It receives and provides access to local
OpenTelemetry data. See the [lotel context](../lotel/CONTEXT.md).

**DevTools URL**:
The single address through which a developer or instrumented application
accesses DevTools.

**Ingestion**:
The receipt of Span Records and Log Records from an instrumented application.
Metrics are outside the Telemetry Tool's scope.
