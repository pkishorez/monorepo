# DevTools — Context

DevTools is the unified local developer experience for the tools in this
repository. It gives developers one place to access independent tools without
merging their domains.

## Language

**DevTools**:
The umbrella through which developers access all local development tools.
_Avoid_: Tool suite, admin panel.

**Tool**:
A self-contained developer capability presented through DevTools. Lotel and
Laymos are Tools.

**Tool Scope**:
Whether a Tool works with repository-wide information or information from one
Project.
_Avoid_: Project scope when the Tool is repository-wide.

**Project**:
A source folder selected for analysis by a Project-scoped Tool.
_Avoid_: Workspace when referring to one selected source folder.

**Laymos**:
The DevTools Tool and domain for describing and analyzing the architecture of a
Project.
_Avoid_: Architecture Tool.

**Lotel**:
The DevTools Tool and domain for receiving and inspecting local OpenTelemetry
data. See the [Lotel context](../lotel/CONTEXT.md).
_Avoid_: Telemetry Tool, OTel Tool.

**DevTools URL**:
The canonical `127.0.0.1` loopback address through which a developer or
instrumented application accesses one running DevTools instance.

**Ingestion**:
The receipt of Span Records and Log Records from an instrumented application.
Metrics are outside the Telemetry Tool's scope.
