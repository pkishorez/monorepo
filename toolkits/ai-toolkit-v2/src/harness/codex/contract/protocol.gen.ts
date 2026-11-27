// Generated from codex-cli 0.164.0 by src/harness/codex/tests/protocol.ts. Do not edit.

/**
 * A path that is guaranteed to be absolute and normalized (though it is not
 * guaranteed to be canonicalized or exist on the filesystem).
 *
 * IMPORTANT: When deserializing an `AbsolutePathBuf`, a base path must be set
 * using [AbsolutePathBufGuard::new]. If no base path is set, the
 * deserialization will fail unless the path being deserialized is already
 * absolute.
 */
export type AbsolutePathBuf = string;

export type AgentMessageInputContent = { "type": "input_text", text: string, } | { "type": "encrypted_content", encrypted_content: string, };

export type AgentPath = string;

export type ApplyPatchApprovalParams = { conversationId: ThreadId,
/**
 * Use to correlate this with [codex_protocol::protocol::PatchApplyBeginEvent]
 * and [codex_protocol::protocol::PatchApplyEndEvent].
 */
callId: string, fileChanges: { [key in string]?: FileChange },
/**
 * Optional explanatory reason (e.g. request for extra write access).
 */
reason: string | null,
/**
 * When set, the agent is asking the user to allow writes under this root
 * for the remainder of the session (unclear if this is honored today).
 */
grantRoot: string | null, };

export type ApplyPatchApprovalResponse = { decision: ReviewDecision, };

/**
 * Authentication mode for OpenAI-backed providers.
 */
export type AuthMode = "apikey" | "chatgpt" | "chatgptAuthTokens" | "headers" | "agentIdentity" | "personalAccessToken" | "bedrockApiKey" | "bedrockAccessKeys";

/**
 * Selects which part of the active context is charged against
 * `model_auto_compact_token_limit`.
 */
export type AutoCompactTokenLimitScope = "total" | "body_after_prefix";

export type ClientInfo = { name: string, title: string | null, version: string, };

export type ClientNotification = { "method": "initialized" };

/**
 * Request from the client to the server.
 */
export type ClientRequest = { "method": "initialize", id: RequestId, params: InitializeParams, } | { "method": "server/diagnostics", id: RequestId, params: ServerDiagnosticsParams, } | { "method": "userVerification/status", id: RequestId, params: UserVerificationStatusParams, } | { "method": "userVerification/enroll", id: RequestId, params: UserVerificationEnrollParams, } | { "method": "userVerification/delete", id: RequestId, params: UserVerificationDeleteParams, } | { "method": "userVerification/verify", id: RequestId, params: UserVerificationVerifyParams, } | { "method": "userVerification/cancel", id: RequestId, params: UserVerificationCancelParams, } | { "method": "thread/start", id: RequestId, params: ThreadStartParams, } | { "method": "thread/resume", id: RequestId, params: ThreadResumeParams, } | { "method": "thread/fork", id: RequestId, params: ThreadForkParams, } | { "method": "thread/sample", id: RequestId, params: ThreadSampleParams, } | { "method": "thread/sample/cancel", id: RequestId, params: ThreadSampleCancelParams, } | { "method": "thread/archive", id: RequestId, params: ThreadArchiveParams, } | { "method": "thread/delete", id: RequestId, params: ThreadDeleteParams, } | { "method": "thread/unsubscribe", id: RequestId, params: ThreadUnsubscribeParams, } | { "method": "thread/increment_elicitation", id: RequestId, params: ThreadIncrementElicitationParams, } | { "method": "thread/decrement_elicitation", id: RequestId, params: ThreadDecrementElicitationParams, } | { "method": "thread/name/set", id: RequestId, params: ThreadSetNameParams, } | { "method": "thread/prediction/request", id: RequestId, params: ThreadPredictionRequestParams, } | { "method": "thread/goal/set", id: RequestId, params: ThreadGoalSetParams, } | { "method": "thread/goal/get", id: RequestId, params: ThreadGoalGetParams, } | { "method": "thread/goal/clear", id: RequestId, params: ThreadGoalClearParams, } | { "method": "thread/queue/add", id: RequestId, params: ThreadQueueAddParams, } | { "method": "thread/queue/list", id: RequestId, params: ThreadQueueListParams, } | { "method": "thread/queue/update", id: RequestId, params: ThreadQueueUpdateParams, } | { "method": "thread/queue/delete", id: RequestId, params: ThreadQueueDeleteParams, } | { "method": "thread/queue/reorder", id: RequestId, params: ThreadQueueReorderParams, } | { "method": "thread/queue/start", id: RequestId, params: ThreadQueueStartParams, } | { "method": "thread/metadata/update", id: RequestId, params: ThreadMetadataUpdateParams, } | { "method": "thread/attachment/add", id: RequestId, params: ThreadAttachmentAddParams, } | { "method": "thread/attachment/list", id: RequestId, params: ThreadAttachmentListParams, } | { "method": "thread/attachmentOwner/list", id: RequestId, params: ThreadAttachmentOwnerListParams, } | { "method": "thread/attachment/remove", id: RequestId, params: ThreadAttachmentRemoveParams, } | { "method": "thread/section/move", id: RequestId, params: ThreadSectionMoveParams, } | { "method": "thread/settings/update", id: RequestId, params: ThreadSettingsUpdateParams, } | { "method": "thread/memoryMode/set", id: RequestId, params: ThreadMemoryModeSetParams, } | { "method": "memory/status", id: RequestId, params: MemoryStatusParams, } | { "method": "memory/reset", id: RequestId, params: undefined, } | { "method": "rollout/compress", id: RequestId, params: undefined, } | { "method": "thread/unarchive", id: RequestId, params: ThreadUnarchiveParams, } | { "method": "thread/compact/start", id: RequestId, params: ThreadCompactStartParams, } | { "method": "thread/shellCommand", id: RequestId, params: ThreadShellCommandParams, } | { "method": "thread/approveGuardianDeniedAction", id: RequestId, params: ThreadApproveGuardianDeniedActionParams, } | { "method": "thread/backgroundTerminals/clean", id: RequestId, params: ThreadBackgroundTerminalsCleanParams, } | { "method": "thread/backgroundTerminals/list", id: RequestId, params: ThreadBackgroundTerminalsListParams, } | { "method": "thread/backgroundTerminals/terminate", id: RequestId, params: ThreadBackgroundTerminalsTerminateParams, } | { "method": "thread/revert", id: RequestId, params: ThreadRevertParams, } | { "method": "thread/list", id: RequestId, params: ThreadListParams, } | { "method": "project/list", id: RequestId, params: ProjectListParams, } | { "method": "project/read", id: RequestId, params: ProjectReadParams, } | { "method": "project/create", id: RequestId, params: ProjectCreateParams, } | { "method": "project/import", id: RequestId, params: ProjectImportParams, } | { "method": "project/update", id: RequestId, params: ProjectUpdateParams, } | { "method": "project/move", id: RequestId, params: ProjectMoveParams, } | { "method": "project/delete", id: RequestId, params: ProjectDeleteParams, } | { "method": "threadSection/list", id: RequestId, params: ThreadSectionListParams, } | { "method": "threadSection/create", id: RequestId, params: ThreadSectionCreateParams, } | { "method": "threadSection/update", id: RequestId, params: ThreadSectionUpdateParams, } | { "method": "threadSection/delete", id: RequestId, params: ThreadSectionDeleteParams, } | { "method": "thread/search", id: RequestId, params: ThreadSearchParams, } | { "method": "thread/searchOccurrences", id: RequestId, params: ThreadSearchOccurrencesParams, } | { "method": "thread/loaded/list", id: RequestId, params: ThreadLoadedListParams, } | { "method": "thread/read", id: RequestId, params: ThreadReadParams, } | { "method": "thread/readState/update", id: RequestId, params: ThreadReadStateUpdateParams, } | { "method": "thread/turns/list", id: RequestId, params: ThreadTurnsListParams, } | { "method": "thread/items/list", id: RequestId, params: ThreadItemsListParams, } | { "method": "thread/items/read", id: RequestId, params: ThreadItemsReadParams, } | { "method": "thread/inject_items", id: RequestId, params: ThreadInjectItemsParams, } | { "method": "skills/list", id: RequestId, params: SkillsListParams, } | { "method": "skills/extraRoots/set", id: RequestId, params: SkillsExtraRootsSetParams, } | { "method": "hooks/list", id: RequestId, params: HooksListParams, } | { "method": "marketplace/add", id: RequestId, params: MarketplaceAddParams, } | { "method": "marketplace/remove", id: RequestId, params: MarketplaceRemoveParams, } | { "method": "marketplace/upgrade", id: RequestId, params: MarketplaceUpgradeParams, } | { "method": "plugin/list", id: RequestId, params: PluginListParams, } | { "method": "plugin/search", id: RequestId, params: PluginSearchParams, } | { "method": "plugin/installed", id: RequestId, params: PluginInstalledParams, } | { "method": "plugin/reconcile", id: RequestId, params: PluginReconcileParams, } | { "method": "plugin/read", id: RequestId, params: PluginReadParams, } | { "method": "plugin/skill/read", id: RequestId, params: PluginSkillReadParams, } | { "method": "plugin/share/save", id: RequestId, params: PluginShareSaveParams, } | { "method": "plugin/share/updateTargets", id: RequestId, params: PluginShareUpdateTargetsParams, } | { "method": "plugin/share/list", id: RequestId, params: PluginShareListParams, } | { "method": "plugin/share/checkout", id: RequestId, params: PluginShareCheckoutParams, } | { "method": "plugin/share/delete", id: RequestId, params: PluginShareDeleteParams, } | { "method": "app/read", id: RequestId, params: AppsReadParams, } | { "method": "app/list", id: RequestId, params: AppsListParams, } | { "method": "app/installed", id: RequestId, params: AppsInstalledParams, } | { "method": "fs/readFile", id: RequestId, params: FsReadFileParams, } | { "method": "fs/writeFile", id: RequestId, params: FsWriteFileParams, } | { "method": "fs/createDirectory", id: RequestId, params: FsCreateDirectoryParams, } | { "method": "fs/getMetadata", id: RequestId, params: FsGetMetadataParams, } | { "method": "fs/readDirectory", id: RequestId, params: FsReadDirectoryParams, } | { "method": "fs/remove", id: RequestId, params: FsRemoveParams, } | { "method": "fs/copy", id: RequestId, params: FsCopyParams, } | { "method": "fs/watch", id: RequestId, params: FsWatchParams, } | { "method": "fs/unwatch", id: RequestId, params: FsUnwatchParams, } | { "method": "skills/config/write", id: RequestId, params: SkillsConfigWriteParams, } | { "method": "plugin/install", id: RequestId, params: PluginInstallParams, } | { "method": "plugin/uninstall", id: RequestId, params: PluginUninstallParams, } | { "method": "turn/start", id: RequestId, params: TurnStartParams, } | { "method": "turn/settings/update", id: RequestId, params: TurnSettingsUpdateParams, } | { "method": "turn/steer", id: RequestId, params: TurnSteerParams, } | { "method": "turn/interrupt", id: RequestId, params: TurnInterruptParams, } | { "method": "thread/realtime/start", id: RequestId, params: ThreadRealtimeStartParams, } | { "method": "thread/realtime/appendAudio", id: RequestId, params: ThreadRealtimeAppendAudioParams, } | { "method": "thread/realtime/appendText", id: RequestId, params: ThreadRealtimeAppendTextParams, } | { "method": "thread/realtime/appendSpeech", id: RequestId, params: ThreadRealtimeAppendSpeechParams, } | { "method": "thread/realtime/stop", id: RequestId, params: ThreadRealtimeStopParams, } | { "method": "thread/timeline/list", id: RequestId, params: ThreadTimelineListParams, } | { "method": "thread/realtime/listVoices", id: RequestId, params: ThreadRealtimeListVoicesParams, } | { "method": "review/start", id: RequestId, params: ReviewStartParams, } | { "method": "model/list", id: RequestId, params: ModelListParams, } | { "method": "account/gatewayOAuth/read", id: RequestId, params: undefined, } | { "method": "account/gatewayOAuth/login", id: RequestId, params: undefined, } | { "method": "account/gatewayOAuth/cancel", id: RequestId, params: undefined, } | { "method": "modelProvider/capabilities/read", id: RequestId, params: ModelProviderCapabilitiesReadParams, } | { "method": "experimentalFeature/list", id: RequestId, params: ExperimentalFeatureListParams, } | { "method": "permissionProfile/list", id: RequestId, params: PermissionProfileListParams, } | { "method": "experimentalFeature/enablement/set", id: RequestId, params: ExperimentalFeatureEnablementSetParams, } | { "method": "remoteControl/enable", id: RequestId, params: RemoteControlEnableParams | null, } | { "method": "remoteControl/disable", id: RequestId, params: RemoteControlDisableParams | null, } | { "method": "remoteControl/status/read", id: RequestId, params: undefined, } | { "method": "remoteControl/pairing/start", id: RequestId, params: RemoteControlPairingStartParams, } | { "method": "remoteControl/pairing/status", id: RequestId, params: RemoteControlPairingStatusParams, } | { "method": "remoteControl/client/list", id: RequestId, params: RemoteControlClientsListParams, } | { "method": "remoteControl/client/revoke", id: RequestId, params: RemoteControlClientsRevokeParams, } | { "method": "collaborationMode/list", id: RequestId, params: CollaborationModeListParams, } | { "method": "mock/experimentalMethod", id: RequestId, params: MockExperimentalMethodParams, } | { "method": "environment/add", id: RequestId, params: EnvironmentAddParams, } | { "method": "environment/info", id: RequestId, params: EnvironmentInfoParams, } | { "method": "environment/status", id: RequestId, params: EnvironmentStatusParams, } | { "method": "mcpServer/oauth/login", id: RequestId, params: McpServerOauthLoginParams, } | { "method": "config/mcpServer/reload", id: RequestId, params: undefined, } | { "method": "mcpServerStatus/list", id: RequestId, params: ListMcpServerStatusParams, } | { "method": "mcpServer/resource/read", id: RequestId, params: McpResourceReadParams, } | { "method": "mcpServer/event/stream/start", id: RequestId, params: McpServerEventStreamStartParams, } | { "method": "mcpServer/event/stream/stop", id: RequestId, params: McpServerEventStreamStopParams, } | { "method": "mcpServer/tool/call", id: RequestId, params: McpServerToolCallParams, } | { "method": "windowsSandbox/setupStart", id: RequestId, params: WindowsSandboxSetupStartParams, } | { "method": "windowsSandbox/readiness", id: RequestId, params: undefined, } | { "method": "account/login/start", id: RequestId, params: LoginAccountParams, } | { "method": "account/bedrock/discover", id: RequestId, params: BedrockDiscoverParams, } | { "method": "account/bedrock/setup", id: RequestId, params: BedrockSetupParams, } | { "method": "account/bedrock/checkGovCloudRequirements", id: RequestId, params: BedrockCheckGovCloudRequirementsParams, } | { "method": "account/login/cancel", id: RequestId, params: CancelLoginAccountParams, } | { "method": "account/logout", id: RequestId, params: undefined, } | { "method": "account/rateLimits/read", id: RequestId, params?: GetAccountRateLimitsParams | undefined, } | { "method": "account/rateLimitResetCredit/consume", id: RequestId, params: ConsumeAccountRateLimitResetCreditParams, } | { "method": "account/usage/read", id: RequestId, params?: GetAccountTokenUsageParams | undefined, } | { "method": "account/workspaceMessages/read", id: RequestId, params: undefined, } | { "method": "account/sendAddCreditsNudgeEmail", id: RequestId, params: SendAddCreditsNudgeEmailParams, } | { "method": "feedback/upload", id: RequestId, params: FeedbackUploadParams, } | { "method": "feedback/save", id: RequestId, params: FeedbackSaveParams, } | { "method": "command/exec", id: RequestId, params: CommandExecParams, } | { "method": "command/exec/write", id: RequestId, params: CommandExecWriteParams, } | { "method": "command/exec/terminate", id: RequestId, params: CommandExecTerminateParams, } | { "method": "command/exec/resize", id: RequestId, params: CommandExecResizeParams, } | { "method": "process/spawn", id: RequestId, params: ProcessSpawnParams, } | { "method": "process/writeStdin", id: RequestId, params: ProcessWriteStdinParams, } | { "method": "process/kill", id: RequestId, params: ProcessKillParams, } | { "method": "process/resizePty", id: RequestId, params: ProcessResizePtyParams, } | { "method": "config/read", id: RequestId, params: ConfigReadParams, } | { "method": "externalAgentConfig/detect", id: RequestId, params: ExternalAgentConfigDetectParams, } | { "method": "externalAgentConfig/import", id: RequestId, params: ExternalAgentConfigImportParams, } | { "method": "externalAgentConfig/import/recordHistory", id: RequestId, params: ExternalAgentConfigImportHistoryRecordParams, } | { "method": "externalAgentConfig/import/readHistories", id: RequestId, params: undefined, } | { "method": "config/value/write", id: RequestId, params: ConfigValueWriteParams, } | { "method": "config/batchWrite", id: RequestId, params: ConfigBatchWriteParams, } | { "method": "configRequirements/read", id: RequestId, params: undefined, } | { "method": "account/read", id: RequestId, params: GetAccountParams, } | { "method": "getConversationSummary", id: RequestId, params: GetConversationSummaryParams, } | { "method": "gitDiffToRemote", id: RequestId, params: GitDiffToRemoteParams, } | { "method": "getAuthStatus", id: RequestId, params: GetAuthStatusParams, } | { "method": "fuzzyFileSearch", id: RequestId, params: FuzzyFileSearchParams, } | { "method": "fuzzyFileSearch/sessionStart", id: RequestId, params: FuzzyFileSearchSessionStartParams, } | { "method": "fuzzyFileSearch/sessionUpdate", id: RequestId, params: FuzzyFileSearchSessionUpdateParams, } | { "method": "fuzzyFileSearch/sessionStop", id: RequestId, params: FuzzyFileSearchSessionStopParams, };

export type CodexResponseHandoffMode = "thinking" | "commentary" | "bemTags";

/**
 * Collaboration mode for a Codex session.
 */
export type CollaborationMode = { mode: ModeKind, settings: Settings, };

/**
 * Reasoning settings interpreted by the backend for the routed model.
 */
export type ConfigurationReasoning = { effort: ReasoningEffort, };

export type ContentItem = { "type": "input_text", text: string, } | { "type": "input_image", detail?: ImageDetail, } & ({ image_url: string, } | { file_id: string, }) | { "type": "input_audio", audio_url: string, } | { "type": "output_text", text: string, annotations?: unknown[], logprobs?: unknown[], };

export type ConversationGitInfo = { sha: string | null, branch: string | null, origin_url: string | null, };

export type ConversationSummary = { conversationId: ThreadId, path: string, preview: string, timestamp: string | null, updatedAt: string | null, modelProvider: string, cwd: string, cliVersion: string, source: V1SessionSource, gitInfo: ConversationGitInfo | null, };

export type ConversationTextRole = "user" | "developer" | "assistant";

export type ExecCommandApprovalParams = { conversationId: ThreadId,
/**
 * Use to correlate this with [codex_protocol::protocol::ExecCommandBeginEvent]
 * and [codex_protocol::protocol::ExecCommandEndEvent].
 */
callId: string,
/**
 * Identifier for this specific approval callback.
 */
approvalId: string | null, command: Array<string>, cwd: string, reason: string | null, parsedCmd: Array<ParsedCommand>, };

export type ExecCommandApprovalResponse = { decision: ReviewDecision, };

/**
 * Proposed execpolicy change to allow commands starting with this prefix.
 *
 * The `command` tokens form the prefix that would be added as an execpolicy
 * `prefix_rule(..., decision="allow")`, letting the agent bypass approval for
 * commands that start with this token sequence.
 */
export type V1ExecPolicyAmendment = Array<string>;

export type FileChange = { "type": "add", content: string, } | { "type": "delete", content: string, } | { "type": "update", unified_diff: string, move_path: string | null, };

export type ForcedLoginMethod = "chatgpt" | "api";

export type FunctionCallOutputBody = string | Array<FunctionCallOutputContentItem>;

/**
 * Responses API compatible content items that can be returned by a tool call.
 * This is a subset of ContentItem with the types we support as function call outputs.
 */
export type FunctionCallOutputContentItem = { "type": "input_text", text: string, } | { "type": "input_image", detail?: ImageDetail, } & ({ image_url: string, } | { file_id: string, }) | { "type": "input_audio", audio_url: string, } | { "type": "encrypted_content", encrypted_content: string, };

export type FuzzyFileSearchMatchType = "file" | "directory";

export type FuzzyFileSearchParams = { query: string, roots: Array<string>, cancellationToken: string | null, };

export type FuzzyFileSearchResponse = { files: Array<FuzzyFileSearchResult>, };

/**
 * Superset of [`codex_file_search::FileMatch`]
 */
export type FuzzyFileSearchResult = { root: string, path: string, match_type: FuzzyFileSearchMatchType, file_name: string, score: number, indices: Array<number> | null, };

export type FuzzyFileSearchSessionCompletedNotification = { sessionId: string, };

export type FuzzyFileSearchSessionStartParams = { sessionId: string, roots: Array<string>, };

export type FuzzyFileSearchSessionStartResponse = Record<string, never>;

export type FuzzyFileSearchSessionStopParams = { sessionId: string, };

export type FuzzyFileSearchSessionStopResponse = Record<string, never>;

export type FuzzyFileSearchSessionUpdateParams = { sessionId: string, query: string, };

export type FuzzyFileSearchSessionUpdateResponse = Record<string, never>;

export type FuzzyFileSearchSessionUpdatedNotification = { sessionId: string, query: string, files: Array<FuzzyFileSearchResult>, };

export type GetAuthStatusParams = { includeToken: boolean | null, refreshToken: boolean | null, };

export type GetAuthStatusResponse = { authMethod: AuthMode | null, authToken: string | null, requiresOpenaiAuth: boolean | null, };

export type GetConversationSummaryParams = { rolloutPath: string, } | { conversationId: ThreadId, };

export type GetConversationSummaryResponse = { summary: ConversationSummary, };

export type GitDiffToRemoteParams = { cwd: string, };

export type GitDiffToRemoteResponse = { sha: GitSha, diff: string, };

export type GitSha = string;

export type ImageDetail = "auto" | "low" | "high" | "original";

export type ImageGenerationFailure = { "type": "usageLimitExceeded", limitId: string, resetsAt: number | null, };

/**
 * A local image file successfully read for this exact image-generation request.
 */
export type ImageGenerationInputImage = { path: AbsolutePathBuf,
/**
 * Lowercase SHA-256 of the file bytes read before image normalization.
 */
sha256: string, };

export type ImageGenerationItem = { id: string, status: string, revisedPrompt: string | null, transparentBackground?: boolean, failure: ImageGenerationFailure | null, savedPath?: AbsolutePathBuf,
/**
 * Observed local inputs for a completed generation, absent on older items.
 */
inputImages?: Array<ImageGenerationInputImage>, } & ({ fileId: string, } | { result: string, });

/**
 * Client-declared capabilities negotiated during initialize.
 */
export type InitializeCapabilities = {
/**
 * Use explicit gateway OAuth login instead of automatic browser authorization.
 * Applies to this app-server's gateway runtime; later connections cannot undo it.
 */
explicitGatewayOauth?: boolean,
/**
 * Opt into receiving experimental API methods and fields.
 */
experimentalApi: boolean,
/**
 * Opt into `attestation/generate` requests for upstream `x-oai-attestation`.
 */
requestAttestation: boolean,
/**
 * Legacy opt-in for the `openai/form` MCP extension.
 *
 * New clients should declare `openai/form` in [`Self::extensions`].
 */
mcpServerOpenaiFormElicitation?: boolean,
/**
 * Exact notification method names that should be suppressed for this
 * connection (for example `thread/started`).
 */
optOutNotificationMethods?: Array<string> | null,
/**
 * MCP extension settings declared by the app-server client.
 */
extensions?: { [key in string]?: JsonValue } | null, };

export type InitializeParams = { clientInfo: ClientInfo, capabilities: InitializeCapabilities | null, };

export type InitializeResponse = { userAgent: string,
/**
 * Absolute path to the server's $CODEX_HOME directory.
 */
codexHome: AbsolutePathBuf,
/**
 * Platform family for the running app-server target, for example
 * `"unix"` or `"windows"`.
 */
platformFamily: string,
/**
 * Operating system for the running app-server target, for example
 * `"macos"`, `"linux"`, or `"windows"`.
 */
platformOs: string, };

/**
 * Canonical user-input modality tags advertised by a model.
 */
export type InputModality = "text" | "image" | "audio";

/**
 * Internal Responses API passthrough metadata copied into underlying chat messages.
 *
 * Responses API strongly types this payload. Do not modify it without first getting API
 * approval and making the corresponding Responses API change.
 */
export type InternalChatMessageMetadataPassthrough = { turn_id?: string, };

export type InternalSessionSource = "memory_consolidation" | "guardian";

/**
 * A UTF-8 path for preserving raw path compatibility at the app-server API
 * boundary while Codex migrates to [`PathUri`].
 *
 * Supports storing arbitrary strings read from the API and converting to and
 * from [`PathUri`] using an explicitly selected native path convention.
 *
 * When converting from [`PathUri`], "native" refers to the supplied
 * [`PathConvention`], which may be foreign to the operating system running
 * this process. The inner string is private so path-producing code must use a
 * path conversion method instead of bypassing the intended conversion
 * boundary. Non-UTF-8 paths are converted to UTF-8 lossily because this API
 * value is serialized as a JSON string.
 *
 * Deserialization and [`Self::from_string`] accept any UTF-8 string without
 * interpreting or validating it. Use [`Self::from_string`] when a caller
 * already owns legacy app-server path text and needs to preserve its wire
 * spelling; use [`Self::from_path`], [`Self::from_abs_path`], or
 * [`Self::from_path_uri`] when converting an actual path value. Relative
 * path text remains valid until an operation such as [`Self::to_path_uri`]
 * requires an absolute path.
 */
export type LegacyAppPathString = string;

export type LocalShellAction = { "type": "exec" } & LocalShellExecAction;

export type LocalShellExecAction = { command: Array<string>, timeout_ms: bigint | null, working_directory: string | null, env: { [key in string]?: string } | null, user: string | null, };

export type LocalShellStatus = "completed" | "in_progress" | "incomplete";

/**
 * Presentation metadata advertised by an initialized MCP server.
 */
export type McpServerInfo = { name: string, title: string | null, version: string, description: string | null, icons: Array<JsonValue> | null, websiteUrl: string | null, };

/**
 * Classifies assistant text as commentary, a partial answer, or a terminal answer.
 *
 * Providers do not emit this consistently, so callers must treat `None` as
 * "phase unknown" and keep compatibility behavior for legacy models.
 */
export type MessagePhase = "commentary" | "partial_answer" | "final_answer";

/**
 * Initial collaboration mode to use when the TUI starts.
 */
export type ModeKind = "plan" | "default";

/**
 * Controls the effective multi-agent delegation instructions for a turn. `custom` means the
 * configured mode hint defines the policy instead of a built-in policy.
 */
export type MultiAgentMode = { "custom": string } | "explicitRequestOnly" | "proactive";

export type V1NetworkPolicyAmendment = { host: string, action: V1NetworkPolicyRuleAction, };

export type V1NetworkPolicyRuleAction = "allow" | "deny";

export type ParsedCommand = { "type": "read", cmd: string, name: string,
/**
 * (Best effort) Path to the file being read by the command. When
 * possible, this is an absolute path, though when relative, it should
 * be resolved against the `cwd`` that will be used to run the command
 * to derive the absolute path.
 */
path: string, } | { "type": "list_files", cmd: string, path: string | null, } | { "type": "search", cmd: string, query: string | null, path: string | null, } | { "type": "unknown", cmd: string, };

/**
 * An immutable, cross-platform representation of a `file:` URI.
 *
 * Only the `file:` scheme is currently accepted. Construction validates the
 * URL, and the URI cannot be mutated after construction. [`Self::basename`],
 * [`Self::parent`], and [`Self::join`] operate on URI path segments without
 * interpreting them using the operating system running Codex. Fallback URIs
 * created by [`Self::from_abs_path`] are opaque to these lexical operations.
 *
 * `file:` paths retain their URI spelling so they can be parsed independently
 * of the current host, except that Windows drive letters are canonicalized to
 * uppercase. A local POSIX `file:` URI can also retain percent-encoded non-UTF-8
 * bytes for lossless native round trips.
 *
 * Like [VS Code resources], path operations use `/` URI separators on every
 * host. Lexical path operations preserve a URL authority without interpreting
 * Windows drive or UNC roots from path text. Windows path equality and hashing
 * ignore ASCII case, while POSIX paths remain case-sensitive. Native path
 * normalization, filesystem aliases, symlinks, and Unicode normalization are
 * not resolved.
 *
 * Serde represents a `PathUri` as its canonical URI string. Deserialization
 * accepts only valid `file:` URI strings. These strings round-trip through
 * their canonical URL form, including encoded non-UTF-8 path bytes.
 *
 * [VS Code resources]: https://github.com/microsoft/vscode/blob/main/src/vs/base/common/resources.ts
 */
export type PathUri = string;

/**
 * Deprecated: `friendly` and `pragmatic` no longer select a style.
 */
export type Personality = "none" | "friendly" | "pragmatic";

export type PlanType = "free" | "go" | "plus" | "pro" | "prolite" | "promax" | "team" | "self_serve_business_prolite" | "self_serve_business_usage_based" | "business" | "ent26" | "enterprise_cbp_automation" | "enterprise_cbp_usage_based" | "enterprise" | "edu" | "edu_plus" | "edu_pro" | "sci" | "sci_plus" | "unknown";

export type RealtimeConversationVersion = "v1" | "v2" | "v3";

export type RealtimeOutputModality = "text" | "audio";

export type RealtimeVoice = "alloy" | "arbor" | "ash" | "aube" | "ballad" | "breeze" | "bubbie" | "cedar" | "coral" | "cove" | "echo" | "ember" | "haetsal" | "hanul" | "himari" | "juniper" | "leher" | "maple" | "marin" | "miko" | "neer" | "porto" | "rindo" | "rio" | "rivage" | "sage" | "selva" | "shimmer" | "sol" | "sonna" | "spruce" | "tinta" | "vale" | "verse" | "viola";

export type RealtimeVoicesList = { v1: Array<RealtimeVoice>, v2: Array<RealtimeVoice>, v3?: Array<RealtimeVoice>, defaultV1: RealtimeVoice, defaultV2: RealtimeVoice, };

/**
 * See https://platform.openai.com/docs/guides/reasoning?api-mode=responses#get-started-with-reasoning
 */
export type ReasoningEffort = string;

export type ReasoningItemContent = { "type": "reasoning_text", text: string, } | { "type": "text", text: string, };

export type ReasoningItemReasoningSummary = { "type": "summary_text", text: string, };

/**
 * A summary of the reasoning performed by the model. This can be useful for
 * debugging and understanding the model's reasoning process.
 * See https://platform.openai.com/docs/guides/reasoning?api-mode=responses#reasoning-summaries
 */
export type ReasoningSummary = "auto" | "concise" | "detailed" | "none";

export type RequestId = string | number;

/**
 * A known resource that the server is capable of reading.
 */
export type Resource = { annotations?: JsonValue, description?: string, mimeType?: string, name: string, size?: number, title?: string, uri: string, icons?: Array<JsonValue>, _meta?: JsonValue, };

/**
 * Contents returned when reading a resource from an MCP server.
 */
export type ResourceContent = {
/**
 * The URI of this resource.
 */
uri: string, mimeType?: string, text: string, _meta?: JsonValue, } | {
/**
 * The URI of this resource.
 */
uri: string, mimeType?: string, blob: string, _meta?: JsonValue, };

/**
 * A template description for resources available on the server.
 */
export type ResourceTemplate = { annotations?: JsonValue, uriTemplate: string, name: string, title?: string, description?: string, mimeType?: string, };

export type ResponseItem = { "type": "additional_tools", id?: ResponseItemId, role: string, tools: unknown[], } | { "type": "message", encrypted_content?: string, status?: string, id?: ResponseItemId, role: string, content: Array<ContentItem>, phase?: MessagePhase, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "agent_message", id?: ResponseItemId, author: string, recipient: string, content: Array<AgentMessageInputContent>, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "reasoning", id?: ResponseItemId, summary: Array<ReasoningItemReasoningSummary>, content?: Array<ReasoningItemContent>, encrypted_content: string | null, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "local_shell_call", encrypted_content?: string,
/**
 * Legacy id field retained for compatibility with older payloads.
 */
id?: ResponseItemId,
/**
 * Set when using the Responses API.
 */
call_id: string | null, status: LocalShellStatus, action: LocalShellAction, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "function_call", encrypted_content?: string, status?: string, id?: ResponseItemId, name: string, namespace?: string, arguments: string, encrypted_function_args?: Array<string>, call_id: string, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "tool_search_call", encrypted_content?: string, id?: ResponseItemId, call_id: string | null, status?: string, execution: string, arguments: unknown, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "function_call_output", id?: ResponseItemId, call_id?: string, name?: string, namespace?: string, output: FunctionCallOutputBody, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "custom_tool_call", encrypted_content?: string, id?: ResponseItemId, status?: string, call_id: string, name: string, namespace?: string, input: string, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "custom_tool_call_output", id?: ResponseItemId, call_id: string, name?: string, output: FunctionCallOutputBody, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "tool_search_output", id?: ResponseItemId, call_id: string | null, status: string, execution: string, tools: unknown[], internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "web_search_call", encrypted_content?: string, id?: ResponseItemId, status?: string, action?: V1WebSearchAction, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "image_generation_call", encrypted_content?: string, id?: ResponseItemId, status: string, revised_prompt?: string, result: string, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "compaction", id?: ResponseItemId, encrypted_content: string, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "configuration_update", reasoning: ConfigurationReasoning, } | { "type": "compaction_trigger", } | { "type": "context_compaction", id?: ResponseItemId, encrypted_content?: string, internal_chat_message_metadata_passthrough?: InternalChatMessageMetadataPassthrough, } | { "type": "other" };

/**
 * A Responses API item ID. New IDs require an explicit prefix; deserialization
 * remains permissive so legacy rollouts can still be read.
 */
export type ResponseItemId = string;

/**
 * User's decision in response to an ExecApprovalRequest.
 */
export type ReviewDecision = "approved" | { "approved_execpolicy_amendment": { proposed_execpolicy_amendment: V1ExecPolicyAmendment, } } | "approved_for_session" | "approved_mcp_policy_amendment" | { "network_policy_amendment": { network_policy_amendment: V1NetworkPolicyAmendment, } } | { "denied": { rejection: string, } } | "timed_out" | "abort";

/**
 * Notification sent from the server to the client.
 */
export type ServerNotification = { "method": "error", "params": ErrorNotification } | { "method": "thread/started", "params": ThreadStartedNotification } | { "method": "thread/status/changed", "params": ThreadStatusChangedNotification } | { "method": "thread/readState/changed", "params": ThreadReadStateChangedNotification } | { "method": "thread/archived", "params": ThreadArchivedNotification } | { "method": "thread/deleted", "params": ThreadDeletedNotification } | { "method": "thread/unarchived", "params": ThreadUnarchivedNotification } | { "method": "thread/closed", "params": ThreadClosedNotification } | { "method": "thread/reverted", "params": ThreadRevertedNotification } | { "method": "skills/changed", "params": SkillsChangedNotification } | { "method": "thread/name/updated", "params": ThreadNameUpdatedNotification } | { "method": "thread/attachment/updated", "params": ThreadAttachmentUpdatedNotification } | { "method": "thread/goal/updated", "params": ThreadGoalUpdatedNotification } | { "method": "thread/prediction/updated", "params": ThreadPredictionUpdatedNotification } | { "method": "thread/goal/cleared", "params": ThreadGoalClearedNotification } | { "method": "thread/queue/changed", "params": ThreadQueueChangedNotification } | { "method": "project/changed", "params": ProjectChangedNotification } | { "method": "thread/project/updated", "params": ThreadProjectUpdatedNotification } | { "method": "thread/environment/connected", "params": EnvironmentConnectionNotification } | { "method": "thread/environment/disconnected", "params": EnvironmentConnectionNotification } | { "method": "thread/settings/updated", "params": ThreadSettingsUpdatedNotification } | { "method": "thread/tokenUsage/updated", "params": ThreadTokenUsageUpdatedNotification } | { "method": "turn/started", "params": TurnStartedNotification } | { "method": "hook/started", "params": HookStartedNotification } | { "method": "turn/completed", "params": TurnCompletedNotification } | { "method": "hook/completed", "params": HookCompletedNotification } | { "method": "turn/diff/updated", "params": TurnDiffUpdatedNotification } | { "method": "turn/plan/updated", "params": TurnPlanUpdatedNotification } | { "method": "item/started", "params": ItemStartedNotification } | { "method": "item/autoApprovalReview/started", "params": ItemGuardianApprovalReviewStartedNotification } | { "method": "item/autoApprovalReview/completed", "params": ItemGuardianApprovalReviewCompletedNotification } | { "method": "autoApprovalReview/strictReviewRequired", "params": StrictReviewRequiredNotification } | { "method": "item/completed", "params": ItemCompletedNotification } | { "method": "rawResponseItem/completed", "params": RawResponseItemCompletedNotification } | { "method": "rawResponse/completed", "params": RawResponseCompletedNotification } | { "method": "item/agentMessage/delta", "params": AgentMessageDeltaNotification } | { "method": "item/plan/delta", "params": PlanDeltaNotification } | { "method": "command/exec/outputDelta", "params": CommandExecOutputDeltaNotification } | { "method": "process/outputDelta", "params": ProcessOutputDeltaNotification } | { "method": "process/exited", "params": ProcessExitedNotification } | { "method": "item/commandExecution/outputDelta", "params": CommandExecutionOutputDeltaNotification } | { "method": "item/commandExecution/terminalInteraction", "params": TerminalInteractionNotification } | { "method": "item/fileChange/outputDelta", "params": FileChangeOutputDeltaNotification } | { "method": "item/fileChange/patchUpdated", "params": FileChangePatchUpdatedNotification } | { "method": "serverRequest/resolved", "params": ServerRequestResolvedNotification } | { "method": "item/mcpToolCall/progress", "params": McpToolCallProgressNotification } | { "method": "mcpServer/oauthLogin/completed", "params": McpServerOauthLoginCompletedNotification } | { "method": "mcpServer/startupStatus/updated", "params": McpServerStatusUpdatedNotification } | { "method": "mcpServer/event/stream/notification", "params": McpServerEventStreamNotification } | { "method": "account/updated", "params": AccountUpdatedNotification } | { "method": "account/gatewayOAuth/changed", "params": GatewayOAuthChangedNotification } | { "method": "account/rateLimits/updated", "params": AccountRateLimitsUpdatedNotification } | { "method": "app/list/updated", "params": AppListUpdatedNotification } | { "method": "remoteControl/status/changed", "params": RemoteControlStatusChangedNotification } | { "method": "externalAgentConfig/import/progress", "params": ExternalAgentConfigImportProgressNotification } | { "method": "externalAgentConfig/import/completed", "params": ExternalAgentConfigImportCompletedNotification } | { "method": "fs/changed", "params": FsChangedNotification } | { "method": "item/reasoning/summaryTextDelta", "params": ReasoningSummaryTextDeltaNotification } | { "method": "item/reasoning/summaryPartAdded", "params": ReasoningSummaryPartAddedNotification } | { "method": "item/reasoning/textDelta", "params": ReasoningTextDeltaNotification } | { "method": "thread/compacted", "params": ContextCompactedNotification } | { "method": "model/rerouted", "params": ModelReroutedNotification } | { "method": "model/verification", "params": ModelVerificationNotification } | { "method": "modelProvider/authRecoveryStarted", "params": AuthRecoveryNotification } | { "method": "modelProvider/authRecoveryCompleted", "params": AuthRecoveryNotification } | { "method": "turn/moderationMetadata", "params": TurnModerationMetadataNotification } | { "method": "model/safetyBuffering/updated", "params": ModelSafetyBufferingUpdatedNotification } | { "method": "warning", "params": WarningNotification } | { "method": "guardianWarning", "params": GuardianWarningNotification } | { "method": "deprecationNotice", "params": DeprecationNoticeNotification } | { "method": "configWarning", "params": ConfigWarningNotification } | { "method": "fuzzyFileSearch/sessionUpdated", "params": FuzzyFileSearchSessionUpdatedNotification } | { "method": "fuzzyFileSearch/sessionCompleted", "params": FuzzyFileSearchSessionCompletedNotification } | { "method": "thread/realtime/started", "params": ThreadRealtimeStartedNotification } | { "method": "thread/realtime/itemAdded", "params": ThreadRealtimeItemAddedNotification } | { "method": "thread/realtime/item/started", "params": ThreadRealtimeItemStartedNotification } | { "method": "thread/realtime/item/transcript/delta", "params": ThreadRealtimeItemTranscriptDeltaNotification } | { "method": "thread/realtime/item/completed", "params": ThreadRealtimeItemCompletedNotification } | { "method": "thread/realtime/transcript/delta", "params": ThreadRealtimeTranscriptDeltaNotification } | { "method": "thread/realtime/transcript/done", "params": ThreadRealtimeTranscriptDoneNotification } | { "method": "thread/realtime/outputAudio/delta", "params": ThreadRealtimeOutputAudioDeltaNotification } | { "method": "thread/realtime/sdp", "params": ThreadRealtimeSdpNotification } | { "method": "thread/realtime/error", "params": ThreadRealtimeErrorNotification } | { "method": "thread/realtime/closed", "params": ThreadRealtimeClosedNotification } | { "method": "windows/worldWritableWarning", "params": WindowsWorldWritableWarningNotification } | { "method": "windowsSandbox/setupCompleted", "params": WindowsSandboxSetupCompletedNotification } | { "method": "account/login/completed", "params": AccountLoginCompletedNotification };

/**
 * Server notification envelope sent over app-server transports.
 *
 * `emitted_at_ms` records when app-server emitted the notification, before it
 * is fanned out to individual connections.
 */
export type ServerNotificationEnvelope = {
/**
 * Unix timestamp (in milliseconds) when app-server emitted this notification.
 *
 * Optional so clients can decode notifications from older app-server
 * versions. Current app-server versions always populate it.
 */
emittedAtMs?: number, } & ({ "method": "error", "params": ErrorNotification } | { "method": "thread/started", "params": ThreadStartedNotification } | { "method": "thread/status/changed", "params": ThreadStatusChangedNotification } | { "method": "thread/readState/changed", "params": ThreadReadStateChangedNotification } | { "method": "thread/archived", "params": ThreadArchivedNotification } | { "method": "thread/deleted", "params": ThreadDeletedNotification } | { "method": "thread/unarchived", "params": ThreadUnarchivedNotification } | { "method": "thread/closed", "params": ThreadClosedNotification } | { "method": "thread/reverted", "params": ThreadRevertedNotification } | { "method": "skills/changed", "params": SkillsChangedNotification } | { "method": "thread/name/updated", "params": ThreadNameUpdatedNotification } | { "method": "thread/attachment/updated", "params": ThreadAttachmentUpdatedNotification } | { "method": "thread/goal/updated", "params": ThreadGoalUpdatedNotification } | { "method": "thread/prediction/updated", "params": ThreadPredictionUpdatedNotification } | { "method": "thread/goal/cleared", "params": ThreadGoalClearedNotification } | { "method": "thread/queue/changed", "params": ThreadQueueChangedNotification } | { "method": "project/changed", "params": ProjectChangedNotification } | { "method": "thread/project/updated", "params": ThreadProjectUpdatedNotification } | { "method": "thread/environment/connected", "params": EnvironmentConnectionNotification } | { "method": "thread/environment/disconnected", "params": EnvironmentConnectionNotification } | { "method": "thread/settings/updated", "params": ThreadSettingsUpdatedNotification } | { "method": "thread/tokenUsage/updated", "params": ThreadTokenUsageUpdatedNotification } | { "method": "turn/started", "params": TurnStartedNotification } | { "method": "hook/started", "params": HookStartedNotification } | { "method": "turn/completed", "params": TurnCompletedNotification } | { "method": "hook/completed", "params": HookCompletedNotification } | { "method": "turn/diff/updated", "params": TurnDiffUpdatedNotification } | { "method": "turn/plan/updated", "params": TurnPlanUpdatedNotification } | { "method": "item/started", "params": ItemStartedNotification } | { "method": "item/autoApprovalReview/started", "params": ItemGuardianApprovalReviewStartedNotification } | { "method": "item/autoApprovalReview/completed", "params": ItemGuardianApprovalReviewCompletedNotification } | { "method": "autoApprovalReview/strictReviewRequired", "params": StrictReviewRequiredNotification } | { "method": "item/completed", "params": ItemCompletedNotification } | { "method": "rawResponseItem/completed", "params": RawResponseItemCompletedNotification } | { "method": "rawResponse/completed", "params": RawResponseCompletedNotification } | { "method": "item/agentMessage/delta", "params": AgentMessageDeltaNotification } | { "method": "item/plan/delta", "params": PlanDeltaNotification } | { "method": "command/exec/outputDelta", "params": CommandExecOutputDeltaNotification } | { "method": "process/outputDelta", "params": ProcessOutputDeltaNotification } | { "method": "process/exited", "params": ProcessExitedNotification } | { "method": "item/commandExecution/outputDelta", "params": CommandExecutionOutputDeltaNotification } | { "method": "item/commandExecution/terminalInteraction", "params": TerminalInteractionNotification } | { "method": "item/fileChange/outputDelta", "params": FileChangeOutputDeltaNotification } | { "method": "item/fileChange/patchUpdated", "params": FileChangePatchUpdatedNotification } | { "method": "serverRequest/resolved", "params": ServerRequestResolvedNotification } | { "method": "item/mcpToolCall/progress", "params": McpToolCallProgressNotification } | { "method": "mcpServer/oauthLogin/completed", "params": McpServerOauthLoginCompletedNotification } | { "method": "mcpServer/startupStatus/updated", "params": McpServerStatusUpdatedNotification } | { "method": "mcpServer/event/stream/notification", "params": McpServerEventStreamNotification } | { "method": "account/updated", "params": AccountUpdatedNotification } | { "method": "account/gatewayOAuth/changed", "params": GatewayOAuthChangedNotification } | { "method": "account/rateLimits/updated", "params": AccountRateLimitsUpdatedNotification } | { "method": "app/list/updated", "params": AppListUpdatedNotification } | { "method": "remoteControl/status/changed", "params": RemoteControlStatusChangedNotification } | { "method": "externalAgentConfig/import/progress", "params": ExternalAgentConfigImportProgressNotification } | { "method": "externalAgentConfig/import/completed", "params": ExternalAgentConfigImportCompletedNotification } | { "method": "fs/changed", "params": FsChangedNotification } | { "method": "item/reasoning/summaryTextDelta", "params": ReasoningSummaryTextDeltaNotification } | { "method": "item/reasoning/summaryPartAdded", "params": ReasoningSummaryPartAddedNotification } | { "method": "item/reasoning/textDelta", "params": ReasoningTextDeltaNotification } | { "method": "thread/compacted", "params": ContextCompactedNotification } | { "method": "model/rerouted", "params": ModelReroutedNotification } | { "method": "model/verification", "params": ModelVerificationNotification } | { "method": "modelProvider/authRecoveryStarted", "params": AuthRecoveryNotification } | { "method": "modelProvider/authRecoveryCompleted", "params": AuthRecoveryNotification } | { "method": "turn/moderationMetadata", "params": TurnModerationMetadataNotification } | { "method": "model/safetyBuffering/updated", "params": ModelSafetyBufferingUpdatedNotification } | { "method": "warning", "params": WarningNotification } | { "method": "guardianWarning", "params": GuardianWarningNotification } | { "method": "deprecationNotice", "params": DeprecationNoticeNotification } | { "method": "configWarning", "params": ConfigWarningNotification } | { "method": "fuzzyFileSearch/sessionUpdated", "params": FuzzyFileSearchSessionUpdatedNotification } | { "method": "fuzzyFileSearch/sessionCompleted", "params": FuzzyFileSearchSessionCompletedNotification } | { "method": "thread/realtime/started", "params": ThreadRealtimeStartedNotification } | { "method": "thread/realtime/itemAdded", "params": ThreadRealtimeItemAddedNotification } | { "method": "thread/realtime/item/started", "params": ThreadRealtimeItemStartedNotification } | { "method": "thread/realtime/item/transcript/delta", "params": ThreadRealtimeItemTranscriptDeltaNotification } | { "method": "thread/realtime/item/completed", "params": ThreadRealtimeItemCompletedNotification } | { "method": "thread/realtime/transcript/delta", "params": ThreadRealtimeTranscriptDeltaNotification } | { "method": "thread/realtime/transcript/done", "params": ThreadRealtimeTranscriptDoneNotification } | { "method": "thread/realtime/outputAudio/delta", "params": ThreadRealtimeOutputAudioDeltaNotification } | { "method": "thread/realtime/sdp", "params": ThreadRealtimeSdpNotification } | { "method": "thread/realtime/error", "params": ThreadRealtimeErrorNotification } | { "method": "thread/realtime/closed", "params": ThreadRealtimeClosedNotification } | { "method": "windows/worldWritableWarning", "params": WindowsWorldWritableWarningNotification } | { "method": "windowsSandbox/setupCompleted", "params": WindowsSandboxSetupCompletedNotification } | { "method": "account/login/completed", "params": AccountLoginCompletedNotification });

/**
 * Request initiated from the server and sent to the client.
 */
export type ServerRequest = { "method": "item/commandExecution/requestApproval", id: RequestId, params: CommandExecutionRequestApprovalParams, } | { "method": "item/fileChange/requestApproval", id: RequestId, params: FileChangeRequestApprovalParams, } | { "method": "item/tool/requestUserInput", id: RequestId, params: ToolRequestUserInputParams, } | { "method": "mcpServer/elicitation/request", id: RequestId, params: McpServerElicitationRequestParams, } | { "method": "item/permissions/requestApproval", id: RequestId, params: PermissionsRequestApprovalParams, } | { "method": "item/tool/call", id: RequestId, params: DynamicToolCallParams, } | { "method": "account/chatgptAuthTokens/refresh", id: RequestId, params: ChatgptAuthTokensRefreshParams, } | { "method": "attestation/generate", id: RequestId, params: AttestationGenerateParams, } | { "method": "currentTime/read", id: RequestId, params: CurrentTimeReadParams, } | { "method": "applyPatchApproval", id: RequestId, params: ApplyPatchApprovalParams, } | { "method": "execCommandApproval", id: RequestId, params: ExecCommandApprovalParams, };

export type V1SessionSource = "cli" | "vscode" | "exec" | "mcp" | { "custom": string } | { "internal": InternalSessionSource } | { "subagent": SubAgentSource } | "unknown";

/**
 * Settings for a collaboration mode.
 */
export type Settings = { model: string, reasoning_effort: ReasoningEffort | null, developer_instructions: string | null, };

/**
 * Display item emitted by the interruptible `clock.sleep` tool.
 */
export type SleepItem = { id: string, durationMs: number, };

export type SubAgentSource = "review" | "compact" | { "thread_spawn": { parent_thread_id: ThreadId, depth: number, agent_path: AgentPath | null, agent_nickname: string | null, agent_role: string | null, } } | "memory_consolidation" | { "other": string };

/**
 * Identifier for a Codex thread.
 *
 * Codex-generated thread IDs are UUIDv7, and some use cases rely on that.
 */
export type ThreadId = string;

export type ThreadMemoryMode = "enabled" | "disabled";

/**
 * Definition for a tool the client can call.
 */
export type Tool = { name: string, title?: string, description?: string, inputSchema: JsonValue, outputSchema?: JsonValue, annotations?: JsonValue, icons?: Array<JsonValue>, _meta?: JsonValue, };

/**
 * A model-facing surface on which a tool can be exposed.
 */
export type ToolExposureSurface = "code_mode" | "deferred" | "direct";

/**
 * Controls output length/detail on GPT-5 models via the Responses API.
 * Serialized with lowercase values to match the OpenAI API.
 */
export type Verbosity = "low" | "medium" | "high";

export type V1WebSearchAction = { "type": "search", query?: string, queries?: Array<string>, } | { "type": "open_page", url?: string, } | { "type": "find_in_page", url?: string, pattern?: string, } | { "type": "other" };

export type WebSearchContextSize = "low" | "medium" | "high";

export type WebSearchItem = { id: string, query: string, action: WebSearchAction | null,
/**
 * Structured search results returned out-of-band by standalone web search.
 *
 * These stay as opaque JSON at the extension/app-server boundary so new
 * result fields and result types can pass through without a Codex release.
 */
results: Array<JsonValue> | null, };

export type WebSearchLocation = { country: string | null, region: string | null, city: string | null, timezone: string | null, };

export type WebSearchMode = "disabled" | "cached" | "indexed" | "live";

export type WebSearchToolConfig = { context_size: WebSearchContextSize | null, allowed_domains: Array<string> | null, location: WebSearchLocation | null, };

export type Account = { "type": "apiKey", } | { "type": "chatgpt", email: string | null, planType: PlanType, } | { "type": "amazonBedrock", usesCodexManagedCredentials: boolean, };

export type AccountLoginCompletedNotification = { loginId: string | null, success: boolean, error: string | null, onboardingEntrypoint: DesktopOnboardingEntrypoint | null, };

/**
 * Sparse rolling rate-limit update.
 *
 * Clients should merge available values into the most recent `account/rateLimits/read` response
 * or refetch that snapshot. Nullable account metadata may be unavailable in a rolling update and
 * does not clear a previously observed value.
 */
export type AccountRateLimitsUpdatedNotification = { rateLimits: RateLimitSnapshot, };

/**
 * Backend routing policy. Wire values match the accounts/check contract.
 */
export type AccountRoutingOverride = "NO_CONSTRAINT" | "us" | "us_cr";

export type AccountTokenUsageDailyBucket = { startDate: string, tokens: bigint, };

export type AccountTokenUsageSummary = { lifetimeTokens: bigint | null, peakDailyTokens: bigint | null, longestRunningTurnSec: bigint | null, currentStreakDays: bigint | null, longestStreakDays: bigint | null, };

export type AccountUpdatedNotification = { authMode: AuthMode | null, planType: PlanType | null, };

export type ActivePermissionProfile = {
/**
 * Identifier from `default_permissions` or the implicit built-in default,
 * such as `:workspace` or a user-defined `[permissions.<id>]` profile.
 */
id: string,
/**
 * Parent profile identifier from the selected permissions profile's
 * `extends` setting, when present.
 */
extends: string | null, };

export type AddCreditsNudgeCreditType = "credits" | "usage_limit";

export type AddCreditsNudgeEmailStatus = "sent" | "cooldown_active";

export type AdditionalContextEntry = { value: string, kind: AdditionalContextKind, };

export type AdditionalContextKind = "untrusted" | "application";

export type AdditionalFileSystemPermissions = {
/**
 * This will be removed in favor of `entries`.
 */
read: Array<LegacyAppPathString> | null,
/**
 * This will be removed in favor of `entries`.
 */
write: Array<LegacyAppPathString> | null, globScanMaxDepth?: number, entries?: Array<FileSystemSandboxEntry>, };

export type AdditionalNetworkPermissions = { enabled: boolean | null, };

export type AdditionalPermissionProfile = {
/**
 * Partial overlay used for per-command permission requests.
 */
network: AdditionalNetworkPermissions | null, fileSystem: AdditionalFileSystemPermissions | null, };

export type AgentMessageDelivery = "async";

export type AgentMessageDeltaNotification = { threadId: string, turnId: string, itemId: string, delta: string, };

export type AllowDenyRequirement = "allow" | "deny";

export type AnalyticsConfig = { enabled: boolean | null, } & ({ [key in string]?: number | string | boolean | Array<JsonValue> | { [key in string]?: JsonValue } | null });

/**
 * EXPERIMENTAL - app metadata returned by app-list APIs.
 */
export type AppBranding = { category: string | null, developer: string | null, website: string | null, privacyPolicy: string | null, termsOfService: string | null, isDiscoverableApp: boolean, };

/**
 * EXPERIMENTAL - app metadata returned by app-list APIs.
 */
export type AppInfo = { id: string, name: string, description: string | null, logoUrl: string | null, logoUrlDark: string | null, iconAssets: { [key in string]?: string } | null, iconDarkAssets: { [key in string]?: string } | null, distributionChannel: string | null, branding: AppBranding | null, appMetadata: AppMetadata | null, labels: { [key in string]?: string } | null, installUrl: string | null, isAccessible: boolean,
/**
 * Whether this app is enabled in config.toml.
 * Example:
 * ```toml
 * [apps.bad_app]
 * enabled = false
 * ```
 */
isEnabled: boolean, pluginDisplayNames: Array<string>, };

/**
 * Account settings for a single app.
 */
export type AppLinksConfig = { [key in string]?: { approvals_reviewer: ApprovalsReviewer | null, default_tools_approval_mode: AppToolApproval | null, } };

/**
 * EXPERIMENTAL - notification emitted when the app list changes.
 */
export type AppListUpdatedNotification = { data: Array<AppInfo>, };

export type AppMetadata = { review: AppReview | null, categories: Array<string> | null, subCategories: Array<string> | null, seoDescription: string | null, screenshots: Array<AppScreenshot> | null, developer: string | null, version: string | null, versionId: string | null, versionNotes: string | null, firstPartyRequiresInstall: boolean | null, showInComposerWhenUnlinked: boolean | null, };

export type AppReview = { status: string, };

export type AppScreenshot = { url: string | null, fileId: string | null, userPrompt: string, };

/**
 * EXPERIMENTAL - app metadata summary for plugin responses.
 */
export type AppSummary = { id: string, name: string, description: string | null, installUrl: string | null, category: string | null, };

export type AppTemplateSummary = { templateId: string, name: string, description: string | null, category: string | null, canonicalConnectorId: string | null, logoUrl: string | null, logoUrlDark: string | null, materializedAppIds: Array<string>, reason: AppTemplateUnavailableReason | null, };

export type AppTemplateUnavailableReason = "NOT_CONFIGURED_FOR_WORKSPACE" | "NO_ACTIVE_WORKSPACE";

export type AppToolApproval = "auto" | "prompt" | "writes" | "approve";

/**
 * EXPERIMENTAL - metadata returned by app/read.
 */
export type AppToolSummary = { name: string, title: string | null, description: string, isEnabled: boolean, disabledReason: string | null, isReadOnly: boolean, };

export type AppToolsConfig = { [key in string]?: { enabled: boolean | null, approval_mode: AppToolApproval | null, } };

export type ApplicationNetworkRequirements = {
/**
 * When enabled, only explicitly allowed exact domains may be contacted.
 */
enabled: boolean, domains: { [key in string]?: NetworkDomainPermission }, };

export type ApplicationRequirements = { network: ApplicationNetworkRequirements | null, storage: ApplicationStorageRequirements | null, };

/**
 * Managed storage settings for new Desktop workspaces, not filesystem access restrictions.
 */
export type ApplicationStorageRequirements = { defaultProjectParent: LegacyAppPathString | null, projectlessWorkspaceRoot: LegacyAppPathString | null, };

/**
 * Configures who approval requests are routed to for review. Examples
 * include sandbox escapes, blocked network access, MCP approval prompts, and
 * ARC escalations. Defaults to `user`. `auto_review` uses a carefully
 * prompted subagent to gather relevant context and apply a risk-based
 * decision framework before approving or denying the request.
 */
export type ApprovalsReviewer = "user" | "auto_review" | "guardian_subagent";

export type AppsConfig = { _default: AppsDefaultConfig | null, } & ({ [key in string]?: { enabled: boolean,
/**
 * Additional model-facing surfaces omitted for this connector's tools.
 */
omit_tools_from: Array<ToolExposureSurface> | null, approvals_reviewer: ApprovalsReviewer | null, destructive_enabled: boolean | null, open_world_enabled: boolean | null, default_tools_approval_mode: AppToolApproval | null, default_tools_enabled: boolean | null, tools: AppToolsConfig | null,
/**
 * Per-account approval settings keyed by link ID.
 */
links: AppLinksConfig | null, } });

export type AppsDefaultConfig = { enabled: boolean, approvals_reviewer: ApprovalsReviewer | null, destructive_enabled: boolean, open_world_enabled: boolean, default_tools_approval_mode: AppToolApproval | null, };

/**
 * Read the committed installed connector runtime snapshot.
 */
export type AppsInstalledParams = {
/**
 * Optional loaded thread id used to evaluate effective app configuration.
 */
threadId?: string | null,
/**
 * When true and Apps are permitted, refresh and publish the hosted connector runtime tool
 * snapshot first.
 */
forceRefresh?: boolean, };

/**
 * The installed connectors in one committed runtime snapshot.
 */
export type AppsInstalledResponse = { apps: Array<InstalledApp>, };

/**
 * EXPERIMENTAL - list available apps/connectors.
 */
export type AppsListParams = {
/**
 * Opaque pagination cursor returned by a previous call.
 */
cursor?: string | null,
/**
 * Optional page size; defaults to a reasonable server-side value.
 */
limit?: number | null,
/**
 * Optional thread id used to evaluate app feature gating from that thread's config.
 */
threadId?: string | null,
/**
 * When true, bypass app caches and fetch the latest data from sources.
 */
forceRefetch?: boolean, };

/**
 * EXPERIMENTAL - app list response.
 */
export type AppsListResponse = { data: Array<AppInfo>,
/**
 * Opaque cursor to pass to the next call to continue after the last item.
 * If None, there are no more items to return.
 */
nextCursor: string | null, };

/**
 * EXPERIMENTAL - read metadata for specific apps/connectors.
 */
export type AppsReadParams = {
/**
 * App ids to read. The server accepts at most 100 ids and deduplicates repeated ids while
 * preserving their first-request order.
 */
appIds: Array<string>,
/**
 * Optional loaded thread id used to evaluate effective app configuration.
 */
threadId?: string | null,
/**
 * When true, include display-only public tool summaries in the returned metadata.
 */
includeTools?: boolean, };

/**
 * EXPERIMENTAL - app/read response.
 */
export type AppsReadResponse = { apps: Array<ConnectorMetadata>, missingAppIds: Array<string>, };

export type AskForApproval = "untrusted" | "on-request" | { "granular": { sandbox_approval: boolean, rules: boolean, skill_approval: boolean, request_permissions: boolean, mcp_elicitations: boolean, } } | "never";

export type AsyncUserInputQuestion = { title: string, options: Array<string> | null, };

export type AttestationGenerateParams = Record<string, never>;

export type AttestationGenerateResponse = {
/**
 * Opaque client attestation token.
 */
token: string, };

export type AuthRecoveryNotification = { threadId: string, turnId: string, provider: string, message: string, };

/**
 * [UNSTABLE] Source that produced a terminal approval auto-review decision.
 */
export type AutoReviewDecisionSource = "agent";

export type AutoReviewRequirements = { requiredOnModels: Array<string> | null, ignoreRules: Array<string> | null, };

export type AwsCredentialType = "accessKeys" | "bedrockApiKey";

export type BedrockAwsProfile = { name: string, region: string | null, };

export type BedrockCheckGovCloudRequirementsParams = Record<string, never>;

/**
 * Advisory check of the current Bedrock configuration after login or setup.
 */
export type BedrockCheckGovCloudRequirementsResponse = {
/**
 * Whether the active Bedrock authentication resolves to a GovCloud region.
 */
isGovCloud: boolean,
/**
 * Whether GovCloud is selected and the managed requirements miss the baseline.
 * A false value is not a general certification of the network configuration.
 */
shouldWarn: boolean, };

export type BedrockDiscoverParams = Record<string, never>;

export type BedrockDiscoverResponse = { profiles: Array<BedrockAwsProfile>, environmentCredentials: Array<BedrockEnvironmentCredential>, };

export type BedrockEnvironmentCredential = { type: AwsCredentialType, region: string | null, };

export type BedrockSetupParams = { "type": "profile", profile: string, region: string, } | { "type": "environment", region: string, };

export type BedrockSetupResponse = Record<string, never>;

export type BrowserUseAccessApprovalLifetime = "turn" | "thread";

export type BrowserUseConfig = { allow_history_access: boolean | null, default_origin_policy: BrowserUseOriginPolicyConfig | null, origins: { [key in string]?: BrowserUseOriginPolicyConfig } | null, };

export type BrowserUseExtensionRequirements = { requestHeaders: Array<RequestHeader> | null, };

export type BrowserUseOriginPolicy = { access: AllowDenyRequirement | null, downloads: AllowDenyRequirement | null, uploads: AllowDenyRequirement | null, fullCdpAccess: AllowDenyRequirement | null, autoReview: AllowDenyRequirement | null, persistentApproval: boolean | null, accessApprovalLifetime: BrowserUseAccessApprovalLifetime | null, };

export type BrowserUseOriginPolicyConfig = { access: AllowDenyRequirement | null, downloads: AllowDenyRequirement | null, uploads: AllowDenyRequirement | null, full_cdp_access: AllowDenyRequirement | null, };

export type BrowserUseRequirements = { extension: BrowserUseExtensionRequirements | null, allowWebmcp: boolean | null, allowHistoryAccess: boolean | null, disableAutoReview: boolean | null, allowGlobalPersistentApproval: boolean | null, defaultOriginPolicy: BrowserUseOriginPolicy | null, origins: { [key in string]?: BrowserUseOriginPolicy } | null, };

export type ByteRange = { start: number, end: number, };

export type CancelLoginAccountParams = { loginId: string, };

export type CancelLoginAccountResponse = { status: CancelLoginAccountStatus, };

export type CancelLoginAccountStatus = "canceled" | "notFound";

/**
 * Location used to resolve a selected capability root.
 */
export type CapabilityRootLocation = { "type": "environment", environmentId: string,
/**
 * Absolute path for the root in the selected environment.
 */
path: string, };

export type ChatgptAuthTokensRefreshParams = { reason: ChatgptAuthTokensRefreshReason,
/**
 * Workspace/account identifier that Codex was previously using.
 *
 * Clients that manage multiple accounts/workspaces can use this as a hint
 * to refresh the token for the correct workspace.
 *
 * This may be `null` when the prior auth state did not include a workspace
 * identifier (`chatgpt_account_id`).
 */
previousAccountId?: string | null, };

export type ChatgptAuthTokensRefreshReason = "unauthorized";

export type ChatgptAuthTokensRefreshResponse = { accessToken: string, chatgptAccountId: string, chatgptPlanType: string | null, };

export type CliAuthCredentialsStoreMode = "file" | "keyring" | "auto" | "ephemeral";

/**
 * This translation layer make sure that we expose codex error code in camel case.
 *
 * When an upstream HTTP status is available (for example, from the Responses API or a provider),
 * it is forwarded in `httpStatusCode` on the relevant `codexErrorInfo` variant.
 */
export type CodexErrorInfo = "contextWindowExceeded" | "sessionBudgetExceeded" | "usageLimitExceeded" | "rateLimitExceeded" | "flexUnavailable" | "serverOverloaded" | "cyberPolicy" | "misalignmentPolicyViolation" | "tooManyDenials" | { "httpConnectionFailed": { httpStatusCode: number | null, } } | { "responseStreamConnectionFailed": { httpStatusCode: number | null, } } | "internalServerError" | "unauthorized" | "badRequest" | "threadRollbackFailed" | "sandboxError" | { "responseStreamDisconnected": { httpStatusCode: number | null, } } | { "responseTooManyFailedAttempts": { httpStatusCode: number | null, } } | { "activeTurnNotSteerable": { turnKind: NonSteerableTurnKind, } } | "other" | string | { [key: string]: unknown };

export type CollabAgentState = { status: CollabAgentStatus, message: string | null, };

export type CollabAgentStatus = "pendingInit" | "running" | "interrupted" | "completed" | "errored" | "shutdown" | "notFound";

export type CollabAgentTool = "spawnAgent" | "sendInput" | "resumeAgent" | "wait" | "closeAgent" | "sendMessage" | "followupTask" | "interruptAgent" | "listAgents";

export type CollabAgentToolCallStatus = "inProgress" | "completed" | "failed" | "interrupted";

/**
 * EXPERIMENTAL - list collaboration mode presets.
 */
export type CollaborationModeListParams = Record<string, never>;

/**
 * EXPERIMENTAL - collaboration mode presets response.
 */
export type CollaborationModeListResponse = { data: Array<CollaborationModeMask>, };

/**
 * EXPERIMENTAL - collaboration mode preset metadata for clients.
 */
export type CollaborationModeMask = { name: string, mode: ModeKind | null, model: string | null, reasoning_effort: ReasoningEffort | null | null, };

export type CommandAction = { "type": "read", command: string, name: string, path: LegacyAppPathString, } | { "type": "listFiles", command: string, path: string | null, } | { "type": "search", command: string, query: string | null, path: string | null, } | { "type": "unknown", command: string, };

/**
 * Base64-encoded output chunk emitted for a streaming `command/exec` request.
 *
 * These notifications are connection-scoped. If the originating connection
 * closes, the server terminates the process.
 */
export type CommandExecOutputDeltaNotification = {
/**
 * Client-supplied, connection-scoped `processId` from the original
 * `command/exec` request.
 */
processId: string,
/**
 * Output stream for this chunk.
 */
stream: CommandExecOutputStream,
/**
 * Base64-encoded output bytes.
 */
deltaBase64: string,
/**
 * `true` on the final streamed chunk for a stream when `outputBytesCap`
 * truncated later output on that stream.
 */
capReached: boolean, };

/**
 * Stream label for `command/exec/outputDelta` notifications.
 */
export type CommandExecOutputStream = "stdout" | "stderr";

/**
 * Run a standalone command (argv vector) in the server sandbox without
 * creating a thread or turn.
 *
 * The final `command/exec` response is deferred until the process exits and is
 * sent only after all `command/exec/outputDelta` notifications for that
 * connection have been emitted.
 */
export type CommandExecParams = {
/**
 * Command argv vector. Empty arrays are rejected.
 */
command: Array<string>,
/**
 * Optional client-supplied, connection-scoped process id.
 *
 * Required for `tty`, `streamStdin`, `streamStdoutStderr`, and follow-up
 * `command/exec/write`, `command/exec/resize`, and
 * `command/exec/terminate` calls. When omitted, buffered execution gets an
 * internal id that is not exposed to the client.
 */
processId?: string | null,
/**
 * Enable PTY mode.
 *
 * This implies `streamStdin` and `streamStdoutStderr`.
 */
tty?: boolean,
/**
 * Allow follow-up `command/exec/write` requests to write stdin bytes.
 *
 * Requires a client-supplied `processId`.
 */
streamStdin?: boolean,
/**
 * Stream stdout/stderr via `command/exec/outputDelta` notifications.
 *
 * Streamed bytes are not duplicated into the final response and require a
 * client-supplied `processId`.
 */
streamStdoutStderr?: boolean,
/**
 * Optional per-stream stdout/stderr capture cap in bytes.
 *
 * When omitted, the server default applies. Cannot be combined with
 * `disableOutputCap`.
 */
outputBytesCap?: number | null,
/**
 * Disable stdout/stderr capture truncation for this request.
 *
 * Cannot be combined with `outputBytesCap`.
 */
disableOutputCap?: boolean,
/**
 * Disable the timeout entirely for this request.
 *
 * Cannot be combined with `timeoutMs`.
 */
disableTimeout?: boolean,
/**
 * Optional timeout in milliseconds.
 *
 * When omitted, the server default applies. Cannot be combined with
 * `disableTimeout`.
 */
timeoutMs?: number | null,
/**
 * Optional working directory. Defaults to the server cwd.
 */
cwd?: string | null,
/**
 * Optional environment overrides merged into the server-computed
 * environment.
 *
 * Matching names override inherited values. Set a key to `null` to unset
 * an inherited variable.
 */
env?: { [key in string]?: string | null } | null,
/**
 * Optional initial PTY size in character cells. Only valid when `tty` is
 * true.
 */
size?: CommandExecTerminalSize | null,
/**
 * Optional sandbox policy for this command.
 *
 * Uses the same shape as thread/turn execution sandbox configuration and
 * defaults to the user's configured policy when omitted. Cannot be
 * combined with `permissionProfile`.
 */
sandboxPolicy?: SandboxPolicy | null,
/**
 * Optional active permissions profile id for this command.
 *
 * Defaults to the user's configured permissions when omitted. Cannot be
 * combined with `sandboxPolicy`.
 */
permissionProfile?: string | null, };

/**
 * Resize a running PTY-backed `command/exec` session.
 */
export type CommandExecResizeParams = {
/**
 * Client-supplied, connection-scoped `processId` from the original
 * `command/exec` request.
 */
processId: string,
/**
 * New PTY size in character cells.
 */
size: CommandExecTerminalSize, };

/**
 * Empty success response for `command/exec/resize`.
 */
export type CommandExecResizeResponse = Record<string, never>;

/**
 * Final buffered result for `command/exec`.
 */
export type CommandExecResponse = {
/**
 * Process exit code.
 */
exitCode: number,
/**
 * Buffered stdout capture.
 *
 * Empty when stdout was streamed via `command/exec/outputDelta`.
 */
stdout: string,
/**
 * Buffered stderr capture.
 *
 * Empty when stderr was streamed via `command/exec/outputDelta`.
 */
stderr: string, };

/**
 * PTY size in character cells for `command/exec` PTY sessions.
 */
export type CommandExecTerminalSize = {
/**
 * Terminal height in character cells.
 */
rows: number,
/**
 * Terminal width in character cells.
 */
cols: number, };

/**
 * Terminate a running `command/exec` session.
 */
export type CommandExecTerminateParams = {
/**
 * Client-supplied, connection-scoped `processId` from the original
 * `command/exec` request.
 */
processId: string, };

/**
 * Empty success response for `command/exec/terminate`.
 */
export type CommandExecTerminateResponse = Record<string, never>;

/**
 * Write stdin bytes to a running `command/exec` session, close stdin, or
 * both.
 */
export type CommandExecWriteParams = {
/**
 * Client-supplied, connection-scoped `processId` from the original
 * `command/exec` request.
 */
processId: string,
/**
 * Optional base64-encoded stdin bytes to write.
 */
deltaBase64?: string | null,
/**
 * Close stdin after writing `deltaBase64`, if present.
 */
closeStdin?: boolean, };

/**
 * Empty success response for `command/exec/write`.
 */
export type CommandExecWriteResponse = Record<string, never>;

export type CommandExecutionApprovalDecision = "accept" | "acceptForSession" | { "acceptWithExecpolicyAmendment": { execpolicy_amendment: ExecPolicyAmendment, } } | { "applyNetworkPolicyAmendment": { network_policy_amendment: NetworkPolicyAmendment, } } | "decline" | "cancel";

/**
 * Distinguishes a command approval from input sent to an existing terminal.
 */
export type CommandExecutionApprovalKind = "command" | "writeStdin";

export type CommandExecutionOutputDeltaNotification = { threadId: string, turnId: string, itemId: string, delta: string, };

export type CommandExecutionRequestApprovalParams = {
/**
 * Kind of action under review. Defaults to `command` for older servers.
 */
kind: CommandExecutionApprovalKind, threadId: string, turnId: string, itemId: string,
/**
 * Unix timestamp (in milliseconds) when this approval request started.
 */
startedAtMs: number,
/**
 * Unique identifier for this specific approval callback.
 *
 * For regular shell/unified_exec approvals, this is null.
 *
 * For zsh-exec-bridge subcommand approvals, multiple callbacks can belong to
 * one parent `itemId`, so `approvalId` is a distinct opaque callback id
 * (a UUID) used to disambiguate routing.
 * Stdin approvals also use a distinct callback id; inspect `kind` to distinguish them.
 */
approvalId?: string | null,
/**
 * Environment in which the command will run.
 */
environmentId: string | null,
/**
 * Optional explanatory reason (e.g. request for network access).
 */
reason?: string | null,
/**
 * Optional context for a managed-network approval prompt.
 */
networkApprovalContext?: NetworkApprovalContext | null,
/**
 * The command to be executed.
 */
command?: string | null,
/**
 * The command's working directory.
 */
cwd?: LegacyAppPathString | null,
/**
 * Best-effort parsed command actions for friendly display.
 */
commandActions?: Array<CommandAction> | null,
/**
 * Optional additional permissions requested for this command.
 */
additionalPermissions?: AdditionalPermissionProfile | null,
/**
 * Optional proposed execpolicy amendment to allow similar commands without prompting.
 */
proposedExecpolicyAmendment?: ExecPolicyAmendment | null,
/**
 * Optional proposed network policy amendments (allow/deny host) for future requests.
 */
proposedNetworkPolicyAmendments?: Array<NetworkPolicyAmendment> | null,
/**
 * Ordered list of decisions the client may present for this prompt.
 */
availableDecisions?: Array<CommandExecutionApprovalDecision> | null, };

export type CommandExecutionRequestApprovalResponse = { decision: CommandExecutionApprovalDecision, };

export type CommandExecutionSource = "agent" | "userShell" | "unifiedExecStartup" | "unifiedExecInteraction";

export type CommandExecutionStatus = "inProgress" | "completed" | "failed" | "declined";

export type CommandMigration = { name: string, };

export type ComputerUseConfig = { default_app_access: AllowDenyRequirement | null, macos: ComputerUseMacosConfig | null, windows: ComputerUseWindowsConfig | null, };

export type ComputerUseMacosConfig = { bundle_ids: { [key in string]?: AllowDenyRequirement } | null, };

export type ComputerUseMacosRequirements = { bundleIds: { [key in string]?: AllowDenyRequirement } | null, };

export type ComputerUseRequirements = { allowLockedComputerUse: boolean | null, allowPersistentApproval: boolean | null, defaultAppAccess: AllowDenyRequirement | null, macos: ComputerUseMacosRequirements | null, windows: ComputerUseWindowsRequirements | null, };

export type ComputerUseWindowsConfig = { aumids: { [key in string]?: AllowDenyRequirement } | null, exes: Array<ComputerUseWindowsExeConfig> | null, };

export type ComputerUseWindowsExeConfig = { publisher_name: string, product_name: string, binary_name: string | null, access: AllowDenyRequirement, };

export type ComputerUseWindowsExeRequirement = { publisherName: string, productName: string, binaryName: string | null, access: AllowDenyRequirement, };

export type ComputerUseWindowsRequirements = { aumids: { [key in string]?: AllowDenyRequirement } | null, exes: Array<ComputerUseWindowsExeRequirement> | null, };

export type Config = { model: string | null, review_model: string | null, model_context_window: bigint | null, model_auto_compact_token_limit: bigint | null, model_auto_compact_token_limit_scope: AutoCompactTokenLimitScope | null, model_provider: string | null, approval_policy: AskForApproval | null,
/**
 * [UNSTABLE] Optional default for where approval requests are routed for
 * review.
 */
approvals_reviewer: ApprovalsReviewer | null, sandbox_mode: SandboxMode | null, sandbox_workspace_write: SandboxWorkspaceWrite | null, forced_chatgpt_workspace_id: ForcedChatgptWorkspaceIds | null, forced_login_method: ForcedLoginMethod | null, web_search: WebSearchMode | null, tools: ToolsV2 | null, instructions: string | null, developer_instructions: string | null, compact_prompt: string | null, model_reasoning_effort: ReasoningEffort | null, model_reasoning_summary: ReasoningSummary | null, model_verbosity: Verbosity | null, service_tier: string | null, analytics: AnalyticsConfig | null, apps: AppsConfig | null, browser_use: BrowserUseConfig | null, computer_use: ComputerUseConfig | null, desktop: { [key in string]?: JsonValue } | null, } & ({ [key in string]?: number | string | boolean | Array<JsonValue> | { [key in string]?: JsonValue } | null });

export type ConfigBatchWriteParams = { edits: Array<ConfigEdit>,
/**
 * Path to the config file to write; defaults to the user's `config.toml` when omitted.
 */
filePath?: string | null, expectedVersion?: string | null,
/**
 * When true, hot-reload updated runtime settings into loaded threads after writing.
 * Session-static model, reasoning-effort, Plan-mode reasoning-effort, and service-tier
 * defaults are not reloaded. The deprecated personality setting is also not reloaded.
 */
reloadUserConfig?: boolean, };

export type ConfigEdit = { keyPath: string, value: JsonValue, mergeStrategy: MergeStrategy, };

export type ConfigLayer = { name: ConfigLayerSource, version: string, config: JsonValue, disabledReason: string | null, };

export type ConfigLayerMetadata = { name: ConfigLayerSource, version: string, };

export type ConfigLayerSource = { "type": "packagedDefaults",
/**
 * Path to the packaged default configuration file.
 */
file: AbsolutePathBuf, } | { "type": "mdm", domain: string, key: string, } | { "type": "system",
/**
 * This is the path to the system config.toml file, though it is not
 * guaranteed to exist.
 */
file: AbsolutePathBuf, } | { "type": "enterpriseManaged",
/**
 * Stable identifier for the delivered layer.
 */
id: string,
/**
 * Admin-facing name for the delivered layer. This is surfaced in
 * diagnostics so users know which cloud layer needs administrator
 * attention.
 */
name: string, } | { "type": "user",
/**
 * This is the path to the user's config.toml file, though it is not
 * guaranteed to exist.
 */
file: AbsolutePathBuf,
/**
 * Name of the selected profile-v2 config layered on top of the base
 * user config, when this layer represents one.
 */
profile: string | null, } | { "type": "project", dotCodexFolder: AbsolutePathBuf, } | { "type": "sessionFlags" } | { "type": "legacyManagedConfigTomlFromFile", file: AbsolutePathBuf, } | { "type": "legacyManagedConfigTomlFromMdm" };

export type ConfigReadParams = { includeLayers?: boolean,
/**
 * Optional working directory to resolve project config layers. If specified,
 * return the effective config as seen from that directory (i.e., including any
 * project layers between `cwd` and the project/repo root).
 */
cwd?: string | null, };

export type ConfigReadResponse = { config: Config, origins: { [key in string]?: ConfigLayerMetadata }, layers: Array<ConfigLayer> | null, };

export type ConfigRequirements = {
/**
 * Exact provider selection required by managed policy.
 */
modelProvider: string | null,
/**
 * Complete required provider definitions, using config.toml field names.
 */
modelProviders: { [key in string]?: JsonValue } | null,
/**
 * Effective login methods after managed, forced-login, and workspace restrictions.
 * An empty list permits no login method. Older servers may omit this field.
 */
allowedLoginMethods: Array<ForcedLoginMethod> | null, cliAuthCredentialsStore: CliAuthCredentialsStoreMode | null, chatgptBaseUrl: string | null, additionalDeveloperInstructions: string | null, allowedApprovalPolicies: Array<AskForApproval> | null, allowedApprovalsReviewers: Array<ApprovalsReviewer> | null, allowedSandboxModes: Array<SandboxMode> | null, allowedWindowsSandboxImplementations: Array<WindowsSandboxImplementation> | null, allowedPermissionProfiles: { [key in string]?: boolean } | null, defaultPermissions: string | null, allowedWebSearchModes: Array<WebSearchMode> | null, allowManagedHooksOnly: boolean | null, allowBrowserAndComputerUse: boolean | null, allowAppshots: boolean | null, allowRemoteControl: boolean | null, computerUse: ComputerUseRequirements | null, browserUse: BrowserUseRequirements | null, inAppBrowser: InAppBrowserRequirements | null, featureRequirements: { [key in string]?: boolean } | null, hooks: ManagedHooksRequirements | null, enforceResidency: ResidencyRequirement | null, network: NetworkRequirements | null, application: ApplicationRequirements | null, autoReview: AutoReviewRequirements | null, models: ModelsRequirements | null, sqliteHome: PathUri | null, logDir: PathUri | null, modelCatalogJson: PathUri | null, checkForUpdateOnStartup: boolean | null, allowLoginShell: boolean | null, feedback: FeedbackRequirements | null, };

export type ConfigRequirementsReadResponse = {
/**
 * Whether Fast and Ultra Fast requirements are enforced independently.
 * Older servers omit this field and use Fast mode as a shared speed gate.
 */
supportsIndependentSpeedModes: boolean | null,
/**
 * Null if no requirements are configured (e.g. no requirements.toml/MDM entries).
 */
requirements: ConfigRequirements | null, };

export type ConfigValueWriteParams = { keyPath: string, value: JsonValue, mergeStrategy: MergeStrategy,
/**
 * Path to the config file to write; defaults to the user's `config.toml` when omitted.
 */
filePath?: string | null, expectedVersion?: string | null, };

export type ConfigWarningNotification = {
/**
 * Concise summary of the warning.
 */
summary: string,
/**
 * Optional extra guidance or error details.
 */
details: string | null,
/**
 * Optional path to the config file that triggered the warning.
 */
path?: string,
/**
 * Optional range for the error location inside the config file.
 */
range?: TextRange, };

export type ConfigWriteResponse = { status: WriteStatus, version: string,
/**
 * Canonical path to the config file that was written.
 */
filePath: AbsolutePathBuf, overriddenMetadata: OverriddenMetadata | null, };

export type ConfiguredHookHandler = { "type": "command", command: string, commandWindows: string | null, timeoutSec: bigint | null, async: boolean, statusMessage: string | null,
/**
 * Approximate token threshold for spilling this hook's `additionalContext` to disk.
 * `null` uses 2,500 tokens; `0` disables spilling for this hook. The threshold is
 * evaluated against the original context; a spilled preview also includes recovery
 * metadata.
 */
additionalContextLimit: number | null, } | { "type": "mcp_tool", server: string, tool: string, input: { [key in string]?: JsonValue }, timeoutSec: bigint | null, statusMessage: string | null, } | { "type": "prompt", } | { "type": "agent", };

export type ConfiguredHookMatcherGroup = { matcher: string | null, hooks: Array<ConfiguredHookHandler>, };

/**
 * EXPERIMENTAL - metadata returned by app/read.
 */
export type ConnectorMetadata = { id: string, name: string, description: string | null, iconUrl: string | null, iconUrlDark: string | null, distributionChannel: string | null, installUrl: string | null, pluginDisplayNames: Array<string>, toolSummaries: Array<AppToolSummary> | null, };

export type ConsumeAccountRateLimitResetCreditOutcome = "reset" | "nothingToReset" | "noCredit" | "alreadyRedeemed";

export type ConsumeAccountRateLimitResetCreditParams = {
/**
 * Identifies one logical reset attempt. A UUID is recommended; reuse the same value when
 * retrying that attempt.
 */
idempotencyKey: string,
/**
 * Opaque reset-credit identifier to redeem. When omitted, the backend selects the next
 * available credit.
 */
creditId?: string | null, };

export type ConsumeAccountRateLimitResetCreditResponse = { outcome: ConsumeAccountRateLimitResetCreditOutcome, };

/**
 * Deprecated: Use `ContextCompaction` item type instead.
 */
export type ContextCompactedNotification = { threadId: string, turnId: string, };

export type CreditsSnapshot = { hasCredits: boolean, unlimited: boolean, balance: string | null, };

export type CurrentTimeReadParams = { threadId: string, };

export type CurrentTimeReadResponse = {
/**
 * Current time as whole Unix seconds.
 */
currentTimeAt: number, };

/**
 * Requested cyber treatment for an OpenAI model turn.
 * Authorization and model-tier restrictions remain server-owned.
 */
export type CyberAccessProgram = "standard" | "daybreakBlue" | "daybreakRed";

export type DeprecationNoticeNotification = {
/**
 * Concise summary of what is deprecated.
 */
summary: string,
/**
 * Optional extra guidance, such as migration steps or rationale.
 */
details: string | null, };

export type DesktopOnboardingEntrypoint = "life_sciences";

export type DynamicToolCallOutputContentItem = { "type": "inputText", text: string, } | { "type": "inputImage", imageUrl: string, } | { "type": "inputAudio", audioUrl: string, };

export type DynamicToolCallParams = { threadId: string, turnId: string, callId: string, namespace: string | null, tool: string, arguments: JsonValue, };

export type DynamicToolCallResponse = { contentItems: Array<DynamicToolCallOutputContentItem>, success: boolean, };

export type DynamicToolCallStatus = "inProgress" | "completed" | "failed";

export type DynamicToolFunctionSpec = { name: string, description: string, inputSchema: JsonValue, deferLoading?: boolean, };

export type DynamicToolNamespaceSpec = { name: string, description: string, tools: Array<DynamicToolNamespaceTool>, };

export type DynamicToolNamespaceTool = { "type": "function" } & DynamicToolFunctionSpec;

export type DynamicToolSpec = { "type": "function" } & DynamicToolFunctionSpec | { "type": "namespace" } & DynamicToolNamespaceSpec;

export type EnvironmentAddParams = { environmentId: string, execServerUrl: string,
/**
 * Optional raw bearer token for executor authentication, including reconnects.
 * Requires a secure transport or a loopback destination.
 */
authBearerToken?: string | null,
/**
 * Optional X-Request-ID for the direct WebSocket upgrade, including reconnects.
 * Requires a secure transport or a loopback destination.
 */
websocketRequestId?: string | null,
/**
 * Optional WebSocket connection timeout. The server default applies when omitted.
 */
connectTimeoutMs?: number | null,
/**
 * Required skills supplied by this environment, checked before model inference.
 */
skills?: EnvironmentSkillsParams | null, };

export type EnvironmentAddResponse = Record<string, never>;

export type EnvironmentConnectionNotification = { threadId: string, environmentId: string, };

export type EnvironmentInfoParams = { environmentId: string, };

export type EnvironmentInfoResponse = { shell: EnvironmentShellInfo,
/**
 * Default working directory reported by the environment, as a canonical file URI.
 */
cwd: PathUri | null, };

export type EnvironmentShellInfo = {
/**
 * Stable shell name, for example `zsh`, `bash`, `powershell`, `sh`, or `cmd`.
 */
name: string,
/**
 * Target-native shell executable path or command name.
 */
path: string, };

export type EnvironmentSkillsParams = {
/**
 * Exact catalog names that must be available from this environment.
 */
required?: Array<string> | null, };

/**
 * Current status observed by app-server without starting or recovering an environment.
 *
 * For a currently ready remote environment, app-server asks the existing
 * exec-server connection for `environment/status` without allowing recovery.
 */
export type EnvironmentStatusKind = "ready" | "pending" | "disconnected" | "unknown";

/**
 * Parameters for reading the current status of one configured environment.
 */
export type EnvironmentStatusParams = {
/**
 * Environment id to inspect.
 */
environmentId: string, };

/**
 * Current status for the requested environment.
 */
export type EnvironmentStatusResponse = {
/**
 * Current status observed without starting or recovering the environment.
 */
status: EnvironmentStatusKind,
/**
 * Human-readable detail for `disconnected` and `unknown`; omitted for other statuses.
 */
error?: string, };

export type ErrorNotification = { error: TurnError, willRetry: boolean, threadId: string, turnId: string, };

export type ExecPolicyAmendment = Array<string>;

export type ExperimentalFeature = {
/**
 * Stable key used in config.toml and CLI flag toggles.
 */
name: string,
/**
 * Lifecycle stage of this feature flag.
 */
stage: ExperimentalFeatureStage,
/**
 * User-facing display name shown in the experimental features UI.
 * Null when this feature is not in beta.
 */
displayName: string | null,
/**
 * Short summary describing what the feature does.
 * Null when this feature is not in beta.
 */
description: string | null,
/**
 * Announcement copy shown to users when the feature is introduced.
 * Null when this feature is not in beta.
 */
announcement: string | null,
/**
 * Whether this feature is currently enabled in the loaded config.
 */
enabled: boolean,
/**
 * Whether this feature is enabled by default.
 */
defaultEnabled: boolean, };

export type ExperimentalFeatureEnablementSetParams = {
/**
 * Process-wide runtime feature enablement keyed by canonical feature name.
 *
 * Only named features are updated. Omitted features are left unchanged.
 * Send an empty map for a no-op.
 */
enablement: { [key in string]?: boolean }, };

export type ExperimentalFeatureEnablementSetResponse = {
/**
 * Feature enablement entries updated by this request.
 */
enablement: { [key in string]?: boolean }, };

export type ExperimentalFeatureListParams = {
/**
 * Opaque pagination cursor returned by a previous call.
 */
cursor?: string | null,
/**
 * Optional page size; defaults to a reasonable server-side value.
 */
limit?: number | null,
/**
 * Optional loaded thread id. Pass this when showing feature state for an
 * existing thread so enablement is computed from that thread's refreshed
 * config, including project-local config for the thread's cwd.
 */
threadId?: string | null, };

export type ExperimentalFeatureListResponse = { data: Array<ExperimentalFeature>,
/**
 * Opaque cursor to pass to the next call to continue after the last item.
 * If None, there are no more items to return.
 */
nextCursor: string | null, };

export type ExperimentalFeatureStage = "beta" | "underDevelopment" | "stable" | "deprecated" | "removed";

export type ExternalAgentConfigDetectParams = {
/**
 * If true, include detection under the user's home directory.
 */
includeHome?: boolean,
/**
 * Zero or more working directories to include for repo-scoped detection.
 */
cwds?: Array<string> | null,
/**
 * Maximum age in days for detected sessions. Missing values use the default limit.
 */
maxSessionAgeDays?: number | null,
/**
 * Maximum number of sessions to detect. Missing values use the default limit.
 */
maxSessions?: number | null,
/**
 * Deprecated field retained for compatibility. This field is ignored; use `migrationSource`
 * to select the migration source.
 */
source?: string | null,
/**
 * Optional migration-source selector. Missing or unrecognized values use the default source.
 */
migrationSource?: string | null, };

export type ExternalAgentConfigDetectResponse = { items: Array<ExternalAgentConfigMigrationItem>, connectors: Array<ExternalAgentDetectedConnectorCandidate>, };

export type ExternalAgentConfigImportCompletedNotification = { importId: string, itemTypeResults: Array<ExternalAgentConfigImportTypeResult>, };

export type ExternalAgentConfigImportHistoriesReadResponse = { data: Array<ExternalAgentConfigImportHistory>, connectors: Array<ExternalAgentImportedConnectorCandidate>, };

export type ExternalAgentConfigImportHistory = { importId: string, providerId: string | null, completedAtMs: bigint, successes: Array<ExternalAgentConfigImportItemTypeSuccess>, failures: Array<ExternalAgentConfigImportItemTypeFailure>, };

export type ExternalAgentConfigImportHistoryRecordParams = {
/**
 * Opaque provider identifier for the externally completed import.
 */
providerId: string,
/**
 * Completed results grouped by imported item type.
 */
itemTypeResults: Array<ExternalAgentConfigImportHistoryRecordTypeResultParams>, };

export type ExternalAgentConfigImportHistoryRecordResponse = { importId: string, };

export type ExternalAgentConfigImportHistoryRecordSuccessParams = { itemType: ExternalAgentConfigMigrationItemType, cwd: string | null, source: string | null, target: string | null,
/**
 * Original title for an imported session, when available.
 */
title?: string | null, };

export type ExternalAgentConfigImportHistoryRecordTypeResultParams = { itemType: ExternalAgentConfigMigrationItemType, successes: Array<ExternalAgentConfigImportHistoryRecordSuccessParams>, failures: Array<ExternalAgentConfigImportItemTypeFailure>, };

export type ExternalAgentConfigImportItemTypeFailure = { itemType: ExternalAgentConfigMigrationItemType, errorType: string | null, subErrorType: string | null, failureStage: string, message: string, cwd: string | null, source: string | null, };

export type ExternalAgentConfigImportItemTypeSuccess = { itemType: ExternalAgentConfigMigrationItemType, cwd: string | null, source: string | null, target: string | null,
/**
 * Original title for an imported session; null for other item types.
 */
title: string | null, };

export type ExternalAgentConfigImportParams = { migrationItems: Array<ExternalAgentConfigMigrationItem>,
/**
 * Optional identifier for the product that initiated the import.
 */
source?: string | null,
/**
 * Opaque provider identifier supplied by the caller for analytics attribution and import
 * history display. This does not select the migration source.
 */
providerId?: string | null,
/**
 * Migration-source selector used to produce the migration items. Pass the same value to
 * detection and import; missing or unrecognized values use the default source.
 */
migrationSource?: string | null, };

export type ExternalAgentConfigImportProgressNotification = { importId: string, itemTypeResults: Array<ExternalAgentConfigImportTypeResult>, };

export type ExternalAgentConfigImportResponse = { importId: string, };

export type ExternalAgentConfigImportTypeResult = { itemType: ExternalAgentConfigMigrationItemType, successes: Array<ExternalAgentConfigImportItemTypeSuccess>, failures: Array<ExternalAgentConfigImportItemTypeFailure>, };

export type ExternalAgentConfigMigrationItem = { itemType: ExternalAgentConfigMigrationItemType, description: string,
/**
 * Null or empty means home-scoped migration; non-empty means repo-scoped migration.
 */
cwd: string | null, details: MigrationDetails | null, };

export type ExternalAgentConfigMigrationItemType = "AGENTS_MD" | "CONFIG" | "SKILLS" | "PLUGINS" | "MCP_SERVER_CONFIG" | "SUBAGENTS" | "HOOKS" | "COMMANDS" | "MEMORY" | "SESSIONS";

export type ExternalAgentDetectedConnectorCandidate = { name: string, sessionCount: number, source: ExternalAgentDetectedConnectorSource, };

export type ExternalAgentDetectedConnectorSource = "remoteMcpServersConfig" | "sessionToolUse";

export type ExternalAgentImportedConnectorCandidate = { name: string, sessionCount: number, source: ExternalAgentImportedConnectorSource, };

export type ExternalAgentImportedConnectorSource = "remoteMcpServersConfig";

export type FeedbackRequirements = { enabled: boolean | null, };

export type FeedbackSaveParams = {
/**
 * Absolute, previously unused ZIP path on the app-server host.
 * The caller owns this file, including after a disconnected RPC.
 */
savePath: LegacyAppPathString, classification: string, reason?: string | null, threadId?: string | null, includeLogs?: boolean, extraLogFiles?: Array<string> | null, tags?: { [key in string]?: string } | null, };

export type FeedbackSaveResponse = { savedPath: LegacyAppPathString, threadId: string,
/**
 * Same prompt hash as feedback/upload; null when prompt metadata is absent.
 */
promptHash: string | null, };

export type FeedbackUploadParams = { classification: string, reason?: string | null, threadId?: string | null, includeLogs?: boolean, extraLogFiles?: Array<string> | null, tags?: { [key in string]?: string } | null, };

export type FeedbackUploadResponse = { threadId: string,
/**
 * Whitespace-normalized SHA-256 of the session base instructions, matching the
 * uploaded `prompt_hash` tag. Does not include later developer messages.
 * Null when the reported rollout has no prompt metadata.
 */
promptHash: string | null, };

export type FileChangeApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

/**
 * Deprecated legacy notification for `apply_patch` textual output.
 *
 * The server no longer emits this notification.
 */
export type FileChangeOutputDeltaNotification = { threadId: string, turnId: string, itemId: string, delta: string, };

export type FileChangePatchUpdatedNotification = { threadId: string, turnId: string, itemId: string, changes: Array<FileUpdateChange>, };

export type FileChangeRequestApprovalParams = { threadId: string, turnId: string, itemId: string,
/**
 * Unix timestamp (in milliseconds) when this approval request started.
 */
startedAtMs: number,
/**
 * Optional explanatory reason (e.g. request for extra write access).
 */
reason?: string | null,
/**
 * [UNSTABLE] When set, the agent is asking the user to allow writes under this root
 * for the remainder of the session (unclear if this is honored today).
 */
grantRoot?: string | null, };

export type FileChangeRequestApprovalResponse = { decision: FileChangeApprovalDecision, };

export type FileSystemAccessMode = "read" | "write" | "deny";

export type FileSystemPath = { "type": "path", path: LegacyAppPathString, } | { "type": "glob_pattern", pattern: string, } | { "type": "special", value: FileSystemSpecialPath, };

export type FileSystemSandboxEntry = { path: FileSystemPath, access: FileSystemAccessMode, };

export type FileSystemSpecialPath = { "kind": "root" } | { "kind": "minimal" } | { "kind": "project_roots", subpath: LegacyAppPathString | null, } | { "kind": "tmpdir" } | { "kind": "slash_tmp" } | { "kind": "unknown", path: string, subpath: LegacyAppPathString | null, };

export type FileUpdateChange = { path: string, kind: PatchChangeKind, diff: string, };

/**
 * Backward-compatible API shape for ChatGPT workspace login restrictions.
 */
export type ForcedChatgptWorkspaceIds = string | Array<string>;

/**
 * Filesystem watch notification emitted for `fs/watch` subscribers.
 */
export type FsChangedNotification = {
/**
 * Watch identifier previously provided to `fs/watch`.
 */
watchId: string,
/**
 * File or directory paths associated with this event.
 */
changedPaths: Array<AbsolutePathBuf>, };

/**
 * Copy a file or directory tree on the host filesystem.
 */
export type FsCopyParams = {
/**
 * Absolute source path.
 */
sourcePath: AbsolutePathBuf,
/**
 * Absolute destination path.
 */
destinationPath: AbsolutePathBuf,
/**
 * Required for directory copies; ignored for file copies.
 */
recursive?: boolean, };

/**
 * Successful response for `fs/copy`.
 */
export type FsCopyResponse = Record<string, never>;

/**
 * Create a directory on the host filesystem.
 */
export type FsCreateDirectoryParams = {
/**
 * Absolute directory path to create.
 */
path: AbsolutePathBuf,
/**
 * Whether parent directories should also be created. Defaults to `true`.
 */
recursive?: boolean | null, };

/**
 * Successful response for `fs/createDirectory`.
 */
export type FsCreateDirectoryResponse = Record<string, never>;

/**
 * Request metadata for an absolute path.
 */
export type FsGetMetadataParams = {
/**
 * Absolute path to inspect.
 */
path: AbsolutePathBuf, };

/**
 * Metadata returned by `fs/getMetadata`.
 */
export type FsGetMetadataResponse = {
/**
 * Whether the path resolves to a directory.
 */
isDirectory: boolean,
/**
 * Whether the path resolves to a regular file.
 */
isFile: boolean,
/**
 * Whether the path itself is a symbolic link.
 */
isSymlink: boolean,
/**
 * File creation time in Unix milliseconds when available, otherwise `0`.
 */
createdAtMs: number,
/**
 * File modification time in Unix milliseconds when available, otherwise `0`.
 */
modifiedAtMs: number, };

/**
 * A directory entry returned by `fs/readDirectory`.
 */
export type FsReadDirectoryEntry = {
/**
 * Direct child entry name only, not an absolute or relative path.
 */
fileName: string,
/**
 * Whether this entry resolves to a directory.
 */
isDirectory: boolean,
/**
 * Whether this entry resolves to a regular file.
 */
isFile: boolean, };

/**
 * List direct child names for a directory.
 */
export type FsReadDirectoryParams = {
/**
 * Absolute directory path to read.
 */
path: AbsolutePathBuf, };

/**
 * Directory entries returned by `fs/readDirectory`.
 */
export type FsReadDirectoryResponse = {
/**
 * Direct child entries in the requested directory.
 */
entries: Array<FsReadDirectoryEntry>, };

/**
 * Read a file from the host filesystem.
 */
export type FsReadFileParams = {
/**
 * Absolute path to read.
 */
path: AbsolutePathBuf, };

/**
 * Base64-encoded file contents returned by `fs/readFile`.
 */
export type FsReadFileResponse = {
/**
 * File contents encoded as base64.
 */
dataBase64: string, };

/**
 * Remove a file or directory tree from the host filesystem.
 */
export type FsRemoveParams = {
/**
 * Absolute path to remove.
 */
path: AbsolutePathBuf,
/**
 * Whether directory removal should recurse. Defaults to `true`.
 */
recursive?: boolean | null,
/**
 * Whether missing paths should be ignored. Defaults to `true`.
 */
force?: boolean | null, };

/**
 * Successful response for `fs/remove`.
 */
export type FsRemoveResponse = Record<string, never>;

/**
 * Stop filesystem watch notifications for a prior `fs/watch`.
 */
export type FsUnwatchParams = {
/**
 * Watch identifier previously provided to `fs/watch`.
 */
watchId: string, };

/**
 * Successful response for `fs/unwatch`.
 */
export type FsUnwatchResponse = Record<string, never>;

/**
 * Start filesystem watch notifications for an absolute path.
 */
export type FsWatchParams = {
/**
 * Connection-scoped watch identifier used for `fs/unwatch` and `fs/changed`.
 */
watchId: string,
/**
 * Absolute file or directory path to watch.
 */
path: AbsolutePathBuf, };

/**
 * Successful response for `fs/watch`.
 */
export type FsWatchResponse = {
/**
 * Canonicalized path associated with the watch.
 */
path: AbsolutePathBuf, };

/**
 * Write a file on the host filesystem.
 */
export type FsWriteFileParams = {
/**
 * Absolute path to write.
 */
path: AbsolutePathBuf,
/**
 * File contents encoded as base64.
 */
dataBase64: string, };

/**
 * Successful response for `fs/writeFile`.
 */
export type FsWriteFileResponse = Record<string, never>;

export type GatewayOAuthCancelResponse = Record<string, never>;

export type GatewayOAuthChangedNotification = {
/**
 * Authorization handoff, sent only to the connection that started login.
 */
authUrl: string | null, providerId: string, status: GatewayOAuthStatus, error: string | null, };

export type GatewayOAuthLoginResponse = Record<string, never>;

/**
 * Current effective gateway policy and credential readiness; never contains credentials.
 */
export type GatewayOAuthReadResponse = { providerId: string, providerName: string,
/**
 * Whether the selected provider uses gateway OAuth, even when already signed in.
 */
required: boolean,
/**
 * Null when the effective provider does not use gateway OAuth.
 */
status: GatewayOAuthStatus | null, error: string | null, };

export type GatewayOAuthStatus = "notReady" | "started" | "succeeded" | "failed";

export type GetAccountParams = {
/**
 * When `true`, requests a proactive token refresh before returning.
 *
 * In managed auth mode this triggers the normal refresh-token flow. In
 * external auth mode this flag is ignored. Clients should refresh tokens
 * themselves and call `account/login/start` with `chatgptAuthTokens`.
 */
refreshToken?: boolean, };

/**
 * Usage-read capabilities of the requesting client, never inferred from its experiment arm.
 */
export type GetAccountRateLimitsParams = {
/**
 * The client supports automatic Luna Reserve fallback. For eligible ChatGPT CLI users,
 * allow the backend to record experiment exposure after ordinary usage is blocked.
 */
supportsLunaReserve?: boolean,
/**
 * Skip the separate reset-credit detail lookup for background usage polls. The usage
 * response still includes the available count; omitted/false preserves detailed reads.
 */
excludeResetCreditDetails?: boolean, };

export type GetAccountRateLimitsResponse = {
/**
 * Backend permission for ordinary included usage, validated against the active account.
 * Null means unavailable; clients must not infer recovery from percentages or reset times.
 */
ordinaryUsageAllowed: boolean | null,
/**
 * Backward-compatible single-bucket view; mirrors the historical payload.
 */
rateLimits: RateLimitSnapshot,
/**
 * Multi-bucket view keyed by metered `limit_id` (for example, `codex`).
 */
rateLimitsByLimitId: { [key in string]?: RateLimitSnapshot } | null, rateLimitResetCredits: RateLimitResetCreditsSummary | null,
/**
 * Account associated with this usage snapshot, when supplied by the backend.
 */
accountId: string | null,
/**
 * Optional backend-owned banner from the same usage read. Its nested keys retain the
 * backend's snake_case contract; an absent banner leaves the client's existing UI unchanged.
 */
rateLimitUpsell: JsonValue | null, };

export type GetAccountResponse = { account: Account | null, requiresOpenaiAuth: boolean, workspaceRouting: WorkspaceRouting | null, };

export type GetAccountTokenUsageParams = {
/**
 * When present, read estimated usage for this thread instead of account-wide token activity.
 */
threadId?: string | null, };

export type GetAccountTokenUsageResponse = { summary: AccountTokenUsageSummary, dailyUsageBuckets: Array<AccountTokenUsageDailyBucket> | null,
/**
 * Estimated usage when a thread was requested and its billing route is available.
 */
threadUsage?: ThreadUsage | null, };

export type GetWorkspaceMessagesResponse = {
/**
 * Whether the workspace-message backend route is available for this client.
 */
featureEnabled: boolean,
/**
 * Active workspace messages returned by the backend.
 */
messages: Array<WorkspaceMessage>, };

export type GitInfo = { sha: string | null, branch: string | null, originUrl: string | null, };

export type GrantedPermissionProfile = { network?: AdditionalNetworkPermissions, fileSystem?: AdditionalFileSystemPermissions, };

/**
 * [UNSTABLE] Temporary approval auto-review payload used by
 * `item/autoApprovalReview/*` notifications. This shape is expected to change
 * soon.
 */
export type GuardianApprovalReview = { status: GuardianApprovalReviewStatus, riskLevel: GuardianRiskLevel | null, userAuthorization: GuardianUserAuthorization | null, rationale: string | null, };

export type GuardianApprovalReviewAction = { "type": "command", source: GuardianCommandSource, command: string, cwd: LegacyAppPathString, } | { "type": "execve", source: GuardianCommandSource, program: string, argv: Array<string>, cwd: AbsolutePathBuf, } | { "type": "writeStdin", approvalId: string, processId: string, stdin: string, cwd: LegacyAppPathString, } | { "type": "applyPatch", cwd: LegacyAppPathString, files: Array<LegacyAppPathString>, } | { "type": "networkAccess", target: string, host: string, protocol: NetworkApprovalProtocol, port: number, } | { "type": "mcpToolCall", server: string, toolName: string, connectorId: string | null, connectorName: string | null, toolTitle: string | null, } | { "type": "requestPermissions", reason: string | null, permissions: RequestPermissionProfile, };

/**
 * [UNSTABLE] Lifecycle state for an approval auto-review.
 */
export type GuardianApprovalReviewStatus = "inProgress" | "approved" | "denied" | "timedOut" | "aborted";

export type GuardianCommandSource = "shell" | "unifiedExec";

/**
 * [UNSTABLE] Risk level assigned by approval auto-review.
 */
export type GuardianRiskLevel = "low" | "medium" | "high" | "critical";

/**
 * [UNSTABLE] Authorization level assigned by approval auto-review.
 */
export type GuardianUserAuthorization = "unknown" | "low" | "medium" | "high";

export type GuardianWarningNotification = {
/**
 * Thread target for the guardian warning.
 */
threadId: string,
/**
 * Concise guardian warning message for the user.
 */
message: string, };

export type HookCompletedNotification = { threadId: string, turnId: string | null, run: HookRunSummary, };

export type HookErrorInfo = { path: string, message: string, };

export type HookEventName = "preModelRequest" | "postModelRequest" | "preToolUse" | "permissionRequest" | "postToolUse" | "preCompact" | "postCompact" | "sessionStart" | "sessionEnd" | "userPromptSubmit" | "subagentStart" | "subagentStop" | "stop" | "interrupt";

export type HookExecutionMode = "sync" | "async";

export type HookHandlerType = "command" | "mcpTool" | "prompt" | "agent";

export type HookMetadata = { key: string, eventName: HookEventName, matcher: string | null, timeoutSec: bigint, statusMessage: string | null,
/**
 * Configured `additionalContext` spill threshold.
 * `null` uses 2,500 tokens; `0` disables spilling.
 */
additionalContextLimit: number | null, sourcePath: AbsolutePathBuf, source: HookSource, pluginId: string | null, displayOrder: bigint, enabled: boolean, isManaged: boolean, currentHash: string, trustStatus: HookTrustStatus, } & ({ "handlerType": "command", command: string, async: boolean, } | { "handlerType": "mcpTool", server: string, tool: string, } | { "handlerType": "prompt", } | { "handlerType": "agent", });

export type HookMigration = { name: string, };

export type HookOutputEntry = { kind: HookOutputEntryKind, text: string, };

export type HookOutputEntryKind = "warning" | "stop" | "feedback" | "context" | "error";

export type HookPromptFragment = { text: string, hookRunId: string, };

export type HookRunStatus = "running" | "completed" | "failed" | "blocked" | "stopped";

export type HookRunSummary = { id: string, eventName: HookEventName, handlerType: HookHandlerType, executionMode: HookExecutionMode, scope: HookScope, sourcePath: AbsolutePathBuf, source: HookSource, displayOrder: bigint, status: HookRunStatus, statusMessage: string | null, startedAt: bigint, completedAt: bigint | null, durationMs: bigint | null, entries: Array<HookOutputEntry>, };

export type HookScope = "thread" | "turn";

export type HookSource = "system" | "user" | "project" | "mdm" | "sessionFlags" | "plugin" | "cloudRequirements" | "cloudManagedConfig" | "legacyManagedConfigFile" | "legacyManagedConfigMdm" | "unknown";

export type HookStartedNotification = { threadId: string, turnId: string | null, run: HookRunSummary, };

export type HookTrustStatus = "managed" | "untrusted" | "trusted" | "modified";

export type HooksListEntry = { cwd: string, hooks: Array<HookMetadata>, warnings: Array<string>, errors: Array<HookErrorInfo>, };

export type HooksListParams = {
/**
 * When empty, defaults to the current session working directory.
 */
cwds?: Array<string>, };

export type HooksListResponse = { data: Array<HooksListEntry>, };

export type InAppBrowserRequirements = { allowExternalBrowserSettingsImport: boolean | null, };

/**
 * Installed connector runtime state.
 */
export type InstalledApp = { id: string,
/**
 * Best-effort name carried by the runtime tool catalog. Canonical app metadata remains owned
 * by `app/read`.
 */
runtimeName: string | null,
/**
 * Effective enabled state after applying global, workspace, local, and managed configuration
 * at read time.
 */
enabled: boolean,
/**
 * Whether the connector is enabled and has a non-synthetic, model-visible tool allowed by
 * effective MCP and app/tool policy in the committed runtime snapshot.
 */
callable: boolean, };

export type ItemCompletedNotification = { item: ThreadItem, threadId: string, turnId: string,
/**
 * Unix timestamp (in milliseconds) when this item lifecycle completed.
 */
completedAtMs: number, };

/**
 * [UNSTABLE] Temporary notification payload for approval auto-review. This
 * shape is expected to change soon.
 */
export type ItemGuardianApprovalReviewCompletedNotification = { threadId: string, turnId: string,
/**
 * Unix timestamp (in milliseconds) when this review started.
 */
startedAtMs: number,
/**
 * Unix timestamp (in milliseconds) when this review completed.
 */
completedAtMs: number,
/**
 * Stable identifier for this review.
 */
reviewId: string,
/**
 * Identifier for the reviewed item or tool call when one exists.
 *
 * In most cases, one review maps to one target item. The exceptions are
 * - execve reviews, where a single command may contain multiple execve
 *   calls to review (only possible when using the shell_zsh_fork feature)
 * - stdin reviews, which refer to the existing parent command item and
 *   have a separate approval ID in the action payload
 * - network policy reviews, where there is no target item
 *
 * A network call is triggered by a CommandExecution item, so having a
 * target_item_id set to the CommandExecution item would be misleading
 * because the review is about the network call, not the command execution.
 * Therefore, target_item_id is set to None for network policy reviews.
 */
targetItemId: string | null, decisionSource: AutoReviewDecisionSource, review: GuardianApprovalReview, action: GuardianApprovalReviewAction, };

/**
 * [UNSTABLE] Temporary notification payload for approval auto-review. This
 * shape is expected to change soon.
 */
export type ItemGuardianApprovalReviewStartedNotification = { threadId: string, turnId: string,
/**
 * Unix timestamp (in milliseconds) when this review started.
 */
startedAtMs: number,
/**
 * Stable identifier for this review.
 */
reviewId: string,
/**
 * Identifier for the reviewed item or tool call when one exists.
 *
 * In most cases, one review maps to one target item. The exceptions are
 * - execve reviews, where a single command may contain multiple execve
 *   calls to review (only possible when using the shell_zsh_fork feature)
 * - stdin reviews, which refer to the existing parent command item and
 *   have a separate approval ID in the action payload
 * - network policy reviews, where there is no target item
 *
 * A network call is triggered by a CommandExecution item, so having a
 * target_item_id set to the CommandExecution item would be misleading
 * because the review is about the network call, not the command execution.
 * Therefore, target_item_id is set to None for network policy reviews.
 */
targetItemId: string | null, review: GuardianApprovalReview, action: GuardianApprovalReviewAction, };

export type ItemStartedNotification = { item: ThreadItem, threadId: string, turnId: string,
/**
 * Unix timestamp (in milliseconds) when this item lifecycle started.
 */
startedAtMs: number, };

export type ListMcpServerStatusParams = {
/**
 * Opaque pagination cursor returned by a previous call.
 */
cursor?: string | null,
/**
 * Optional page size; defaults to a server-defined value.
 */
limit?: number | null,
/**
 * Controls how much MCP inventory data to fetch for each server.
 * Defaults to `Full` when omitted.
 */
detail?: McpServerStatusDetail | null, threadId?: string | null,
/**
 * Limit discovery to one server. With a thread ID, reuse that thread's MCP connection.
 */
serverName?: string | null, };

export type ListMcpServerStatusResponse = { data: Array<McpServerStatus>,
/**
 * Opaque cursor to pass to the next call to continue after the last item.
 * If None, there are no more items to return.
 */
nextCursor: string | null, };

export type LoginAccountParams = { "type": "apiKey", apiKey: string, } | { "type": "chatgpt", codexStreamlinedLogin?: boolean, useHostedLoginSuccessPage?: boolean, appBrand?: LoginAppBrand | null, } | { "type": "chatgptDeviceCode" } | { "type": "chatgptAuthTokens",
/**
 * Access token (JWT) supplied by the client.
 * This token is used for backend API requests and email extraction.
 */
accessToken: string,
/**
 * Workspace/account identifier supplied by the client.
 */
chatgptAccountId: string,
/**
 * Optional plan type supplied by the client.
 *
 * When `null`, Codex attempts to derive the plan type from access-token
 * claims. If unavailable, the plan defaults to `unknown`.
 */
chatgptPlanType?: string | null, } | { "type": "amazonBedrock", apiKey: string, region: string, } | { "type": "amazonBedrockAccessKeys", accessKeyId: string, secretAccessKey: string, sessionToken?: string | null, region: string, };

export type LoginAccountResponse = { "type": "apiKey", } | { "type": "chatgpt", loginId: string,
/**
 * URL the client should open in a browser to initiate the OAuth flow.
 */
authUrl: string, } | { "type": "chatgptDeviceCode", loginId: string,
/**
 * URL the client should open in a browser to complete device code authorization.
 */
verificationUrl: string,
/**
 * One-time code the user must enter after signing in.
 */
userCode: string, } | { "type": "chatgptAuthTokens", } | { "type": "amazonBedrock", };

export type LoginAppBrand = "codex" | "chatgpt";

export type LogoutAccountResponse = Record<string, never>;

export type ManagedHooksRequirements = { PreModelRequest: Array<ConfiguredHookMatcherGroup>, PostModelRequest: Array<ConfiguredHookMatcherGroup>, managedDir: string | null, windowsManagedDir: string | null, PreToolUse: Array<ConfiguredHookMatcherGroup>, PermissionRequest: Array<ConfiguredHookMatcherGroup>, PostToolUse: Array<ConfiguredHookMatcherGroup>, PreCompact: Array<ConfiguredHookMatcherGroup>, PostCompact: Array<ConfiguredHookMatcherGroup>, SessionStart: Array<ConfiguredHookMatcherGroup>, SessionEnd: Array<ConfiguredHookMatcherGroup>, UserPromptSubmit: Array<ConfiguredHookMatcherGroup>, SubagentStart: Array<ConfiguredHookMatcherGroup>, SubagentStop: Array<ConfiguredHookMatcherGroup>, Stop: Array<ConfiguredHookMatcherGroup>, Interrupt: Array<ConfiguredHookMatcherGroup>, };

export type MarketplaceAddParams = { source: string, refName?: string | null, sparsePaths?: Array<string> | null, };

export type MarketplaceAddResponse = { marketplaceName: string, installedRoot: AbsolutePathBuf, alreadyAdded: boolean, };

export type MarketplaceInterface = { displayName: string | null, };

export type MarketplaceLoadErrorInfo = { marketplacePath: AbsolutePathBuf, message: string, };

export type MarketplaceRemoveParams = { marketplaceName: string, };

export type MarketplaceRemoveResponse = { marketplaceName: string, installedRoot: AbsolutePathBuf | null, };

export type MarketplaceUpgradeErrorInfo = { marketplaceName: string, message: string, };

export type MarketplaceUpgradeParams = { marketplaceName?: string | null, };

export type MarketplaceUpgradeResponse = { selectedMarketplaces: Array<string>, upgradedRoots: Array<AbsolutePathBuf>, errors: Array<MarketplaceUpgradeErrorInfo>, };

export type McpAppDisplayMode = "inline" | "fullscreen";

/**
 * UI resource and display preference for model invocations, captured from the tool descriptor.
 */
export type McpAppUi = { resourceUri: string, preferredModelDisplayMode: McpAppDisplayMode, };

export type McpAuthStatus = "unknown" | "unsupported" | "notLoggedIn" | "bearerToken" | "oAuth";

export type McpElicitationArrayType = "array";

export type McpElicitationBooleanSchema = { type: McpElicitationBooleanType, title?: string, description?: string, default?: boolean, };

export type McpElicitationBooleanType = "boolean";

export type McpElicitationConstOption = { const: string, title: string, };

export type McpElicitationEnumSchema = McpElicitationSingleSelectEnumSchema | McpElicitationMultiSelectEnumSchema | McpElicitationLegacyTitledEnumSchema;

export type McpElicitationLegacyTitledEnumSchema = { type: McpElicitationStringType, title?: string, description?: string, enum: Array<string>, enumNames?: Array<string>, default?: string, };

export type McpElicitationMultiSelectEnumSchema = McpElicitationUntitledMultiSelectEnumSchema | McpElicitationTitledMultiSelectEnumSchema;

export type McpElicitationNumberSchema = { type: McpElicitationNumberType, title?: string, description?: string, minimum?: number, maximum?: number, default?: number, };

export type McpElicitationNumberType = "number" | "integer";

export type McpElicitationObjectType = "object";

export type McpElicitationPrimitiveSchema = McpElicitationEnumSchema | McpElicitationStringSchema | McpElicitationNumberSchema | McpElicitationBooleanSchema;

/**
 * Typed form schema for MCP `elicitation/create` requests.
 *
 * This matches the `requestedSchema` shape from the MCP 2025-11-25
 * `ElicitRequestFormParams` schema.
 */
export type McpElicitationSchema = { $schema?: string, type: McpElicitationObjectType, properties: { [key in string]?: McpElicitationPrimitiveSchema }, required?: Array<string>, };

export type McpElicitationSingleSelectEnumSchema = McpElicitationUntitledSingleSelectEnumSchema | McpElicitationTitledSingleSelectEnumSchema;

export type McpElicitationStringFormat = "email" | "uri" | "date" | "date-time";

export type McpElicitationStringSchema = { type: McpElicitationStringType, title?: string, description?: string, minLength?: number, maxLength?: number, format?: McpElicitationStringFormat, default?: string, };

export type McpElicitationStringType = "string";

export type McpElicitationTitledEnumItems = { anyOf: Array<McpElicitationConstOption>, };

export type McpElicitationTitledMultiSelectEnumSchema = { type: McpElicitationArrayType, title?: string, description?: string, minItems?: bigint, maxItems?: bigint, items: McpElicitationTitledEnumItems, default?: Array<string>, };

export type McpElicitationTitledSingleSelectEnumSchema = { type: McpElicitationStringType, title?: string, description?: string, oneOf: Array<McpElicitationConstOption>, default?: string, };

export type McpElicitationUntitledEnumItems = { type: McpElicitationStringType, enum: Array<string>, };

export type McpElicitationUntitledMultiSelectEnumSchema = { type: McpElicitationArrayType, title?: string, description?: string, minItems?: bigint, maxItems?: bigint, items: McpElicitationUntitledEnumItems, default?: Array<string>, };

export type McpElicitationUntitledSingleSelectEnumSchema = { type: McpElicitationStringType, title?: string, description?: string, enum: Array<string>, default?: string, };

export type McpResourceReadParams = { threadId?: string | null,
/**
 * Originating MCP tool call used to select the resource's app.
 */
originCallId?: string | null, server: string, uri: string, connectorId?: string | null,
/**
 * Explicit hosted app/account. Omit to retain legacy resource discovery.
 */
target?: McpResourceReadTarget | null, };

export type McpResourceReadResponse = { contents: Array<ResourceContent>,
/**
 * Originating call when the server applied app-specific resource scoping.
 */
originCallId: string | null, };

export type McpResourceReadTarget = { connectorId: string,
/**
 * Null explicitly requests no-auth access, subject to the app's resource policy.
 */
linkId: string | null, };

export type McpServerConnectionStatus = "notStarted" | "starting" | "connected" | "authenticationRequired" | "failed" | "cancelled" | "disabled";

export type McpServerElicitationAction = "accept" | "decline" | "cancel";

export type McpServerElicitationRequestParams = { threadId: string,
/**
 * Active Codex turn when this elicitation was observed, if app-server could correlate one.
 *
 * This is nullable because MCP models elicitation as a standalone server-to-client request
 * identified by the MCP server request id. It may be triggered during a turn, but turn
 * context is app-server correlation rather than part of the protocol identity of the
 * elicitation itself.
 */
turnId: string | null, serverName: string, } & ({ "mode": "openai/userVerification", _meta: JsonValue | null, title: string, description: string, challenge: string, } | { "mode": "form", _meta: JsonValue | null, message: string, requestedSchema: McpElicitationSchema, } | { "mode": "openai/form", _meta: JsonValue | null, message: string, requestedSchema: JsonValue, } | { "mode": "openaiForm", _meta: JsonValue | null, message: string, requestedSchema: JsonValue, } | { "mode": "url", _meta: JsonValue | null, message: string, url: string, elicitationId: string, });

export type McpServerElicitationRequestResponse = { action: McpServerElicitationAction,
/**
 * Structured user input for accepted elicitations, mirroring RMCP `CreateElicitationResult`.
 *
 * This is nullable because decline/cancel responses have no content.
 */
content: JsonValue | null,
/**
 * Optional client metadata for form-mode action handling.
 */
_meta: JsonValue | null, };

export type McpServerEventNotification = { method: string, params: JsonValue, };

export type McpServerEventStreamNotification = { subscriptionId: string, notification: McpServerEventNotification, };

export type McpServerEventStreamStartParams = { threadId: string, server: string, subscriptionId: string, name: string, arguments: JsonValue, _meta?: JsonValue | null, };

export type McpServerEventStreamStartResponse = Record<string, never>;

export type McpServerEventStreamStopParams = { subscriptionId: string, };

export type McpServerEventStreamStopResponse = Record<string, never>;

export type McpServerMigration = { name: string, };

export type McpServerOauthClientRegistration = "auto" | "cimd" | "dcr";

export type McpServerOauthLoginCompletedNotification = { name: string, threadId: string | null,
/**
 * Identifies the explicit login attempt. Older servers omit this field.
 */
loginId?: string | null, success: boolean, error?: string, };

export type McpServerOauthLoginParams = { name: string, threadId?: string | null,
/**
 * Registration strategy for this login only; omission selects automatic discovery.
 */
clientRegistration?: McpServerOauthClientRegistration | null, scopes?: Array<string> | null, timeoutSecs?: bigint | null, };

export type McpServerOauthLoginResponse = { authorizationUrl: string,
/**
 * Identifies this login attempt across the response and completion notification.
 * Older servers omit this field; current servers always return it.
 */
loginId?: string, };

export type McpServerRefreshResponse = Record<string, never>;

export type McpServerStartupFailureReason = "reauthenticationRequired";

export type McpServerStartupState = "starting" | "ready" | "failed" | "cancelled";

export type McpServerStatus = { name: string,
/**
 * Current thread-runtime connection state; null when unavailable or the configuration changed.
 */
runtimeStatus: McpServerConnectionStatus | null, pluginId: string | null,
/**
 * HTTP origin of the effective configured endpoint, including plugin servers.
 * Excludes credentials, path, query, and fragment; null for non-HTTP transports.
 */
httpOrigin: string | null, serverInfo: McpServerInfo | null,
/**
 * Capabilities advertised by the initialized MCP server; null when unavailable.
 */
serverCapabilities: JsonValue | null,
/**
 * Opaque `_meta` from the first page of the corresponding MCP tool catalog. Null when unavailable.
 */
toolListMeta: JsonValue | null, tools: { [key in string]?: Tool },
/**
 * Tool discovery failed and no catalog was returned.
 * Null when a catalog is returned, including cached or empty catalogs.
 */
toolsError: string | null, resources: Array<Resource>, resourceTemplates: Array<ResourceTemplate>, authStatus: McpAuthStatus, };

export type McpServerStatusDetail = "full" | "toolsAndAuthOnly";

export type McpServerStatusUpdatedNotification = { threadId: string | null, name: string, status: McpServerStartupState, error: string | null, failureReason: McpServerStartupFailureReason | null, };

export type McpServerToolCallParams = { threadId: string, server: string, tool: string, arguments?: JsonValue, _meta?: JsonValue, };

export type McpServerToolCallResponse = { content: Array<JsonValue>, structuredContent?: JsonValue, isError?: boolean, _meta?: JsonValue, };

export type McpToolCallAppContext = { connectorId: string, linkId: string | null, resourceUri: string | null, appName: string | null, actionName: string | null, };

export type McpToolCallError = { message: string, };

export type McpToolCallProgressNotification = { threadId: string, turnId: string, itemId: string, message: string, };

export type McpToolCallResult = { content: Array<JsonValue>, structuredContent: JsonValue | null, _meta: JsonValue | null, };

export type McpToolCallStatus = "inProgress" | "completed" | "failed";

export type MemoryCitation = { entries: Array<MemoryCitationEntry>, threadIds: Array<string>, };

export type MemoryCitationEntry = { path: string, lineStart: number, lineEnd: number, note: string, };

export type MemoryResetResponse = Record<string, never>;

export type MemoryStatusParams = {
/**
 * Required distinct consolidated threads. Defaults to 20; supported range is 1..=4096.
 */
minConsolidatedThreads?: number | null, };

export type MemoryStatusResponse = { v2ConsolidatedThreads: number, v2Ready: boolean, };

export type MergeStrategy = "replace" | "upsert";

export type MigrationDetails = { plugins: Array<PluginsMigration>, skills: Array<SkillMigration>, sessions: Array<SessionMigration>, mcpServers: Array<McpServerMigration>, hooks: Array<HookMigration>, subagents: Array<SubagentMigration>, commands: Array<CommandMigration>, memory?: Array<string>, };

export type MisalignmentErrorDetails = {
/**
 * Open-ended classification; clients must accept categories added by Responses.
 */
errorType: string | null,
/**
 * A substantive localized explanation is required before offering continuation.
 */
detailedExplanation: string | null,
/**
 * Instruction to submit as the next turn's user input if continuation is confirmed.
 */
steer: MisalignmentSteer | null,
/**
 * Opaque server-issued block target. Presence alone does not enable target-based continuation.
 */
reviewTarget?: string | null, };

export type MisalignmentSteer = { message: string, };

export type MockExperimentalMethodParams = {
/**
 * Test-only payload field.
 */
value?: string | null, };

export type MockExperimentalMethodResponse = {
/**
 * Echoes the input `value`.
 */
echoed: string | null, };

export type Model = { id: string, model: string, upgrade: string | null, upgradeInfo: ModelUpgradeInfo | null, availabilityNux: ModelAvailabilityNux | null, displayName: string, description: string, modelSpecialty: string | null, hidden: boolean, supportedReasoningEfforts: Array<ReasoningEffortOption>, defaultReasoningEffort: ReasoningEffort, inputModalities: Array<InputModality>,
/**
 * @deprecated Always false; models no longer support personality selection.
 */
supportsPersonality: boolean,
/**
 * Multi-agent runtime declared by this model, when available.
 */
multiAgentVersion: MultiAgentVersion | null,
/**
 * Deprecated: use `serviceTiers` instead.
 */
additionalSpeedTiers: Array<string>, serviceTiers: Array<ModelServiceTier>,
/**
 * Catalog default service tier id for this model, when one is configured.
 */
defaultServiceTier: string | null,
/**
 * Null when the catalog does not provide access-program metadata.
 */
availableAccessPrograms: ModelAccessPrograms | null, isDefault: boolean, };

/**
 * Caller-specific explicit access programs advertised by model discovery.
 */
export type ModelAccessPrograms = {
/**
 * Accepted explicit selections.
 */
cyber: Array<CyberAccessProgram>, };

export type ModelAvailabilityNux = { message: string, };

export type ModelListParams = {
/**
 * Opaque pagination cursor returned by a previous call.
 */
cursor?: string | null,
/**
 * Optional page size; defaults to a reasonable server-side value.
 */
limit?: number | null,
/**
 * When true, include models that are hidden from the default picker list.
 */
includeHidden?: boolean | null, };

export type ModelListResponse = { data: Array<Model>,
/**
 * Opaque cursor to pass to the next call to continue after the last item.
 * If None, there are no more items to return.
 */
nextCursor: string | null, };

export type ModelProviderCapabilitiesReadParams = Record<string, never>;

export type ModelProviderCapabilitiesReadResponse = { imageGeneration: boolean, webSearch: boolean, };

export type ModelRerouteReason = "highRiskCyberActivity";

export type ModelReroutedNotification = { threadId: string, turnId: string, fromModel: string, toModel: string, reason: ModelRerouteReason, };

export type ModelSafetyBufferingUpdatedNotification = { threadId: string, turnId: string, model: string, useCases: Array<string>, reasons: Array<string>, showBufferingUi: boolean, fasterModel: string | null, };

export type ModelServiceTier = { id: string, name: string, description: string, };

export type ModelUpgradeInfo = { model: string, upgradeCopy: string | null, modelLink: string | null, migrationMarkdown: string | null,
/**
 * Informational Unix timestamp for this upgrade's scheduled retirement, if known.
 */
retirementAt: number | null, };

export type ModelVerification = "trustedAccessForCyber";

export type ModelVerificationNotification = { threadId: string, turnId: string, verifications: Array<ModelVerification>, };

export type ModelsRequirements = { newThread: NewThreadModelDefaults | null, };

/**
 * Multi-agent runtime supported by a model.
 */
export type MultiAgentVersion = "disabled" | "v1" | "v2";

export type NetworkAccess = "restricted" | "enabled";

export type NetworkApprovalContext = { host: string, protocol: NetworkApprovalProtocol, };

export type NetworkApprovalProtocol = "http" | "https" | "socks5Tcp" | "socks5Udp";

export type NetworkDomainPermission = "allow" | "deny";

export type NetworkPolicyAmendment = { host: string, action: NetworkPolicyRuleAction, };

export type NetworkPolicyRuleAction = "allow" | "deny";

export type NetworkRequirements = { enabled: boolean | null, httpPort: number | null, socksPort: number | null, allowUpstreamProxy: boolean | null, dangerouslyAllowNonLoopbackProxy: boolean | null, dangerouslyAllowAllUnixSockets: boolean | null,
/**
 * Canonical network permission map for `experimental_network`.
 */
domains: { [key in string]?: NetworkDomainPermission } | null,
/**
 * When true, only managed allowlist entries are respected while managed
 * network enforcement is active.
 */
managedAllowedDomainsOnly: boolean | null,
/**
 * Legacy compatibility view derived from `domains`.
 */
allowedDomains: Array<string> | null,
/**
 * Legacy compatibility view derived from `domains`.
 */
deniedDomains: Array<string> | null,
/**
 * Canonical unix socket permission map for `experimental_network`.
 */
unixSockets: { [key in string]?: NetworkUnixSocketPermission } | null,
/**
 * Legacy compatibility view derived from `unix_sockets`.
 */
allowUnixSockets: Array<string> | null, allowLocalBinding: boolean | null, };

export type NetworkUnixSocketPermission = "allow" | "deny";

export type NewThreadModelDefaults = { model: string | null, modelReasoningEffort: ReasoningEffort | null, serviceTier: string | null, };

export type NonSteerableTurnKind = "review" | "compact";

export type OverriddenMetadata = { message: string, overridingLayer: ConfigLayerMetadata, effectiveValue: JsonValue, };

export type PatchApplyStatus = "inProgress" | "completed" | "failed" | "declined";

export type PatchChangeKind = { "type": "add" } | { "type": "delete" } | { "type": "update", move_path: string | null, };

export type PermissionGrantScope = "turn" | "session";

export type PermissionProfileListParams = {
/**
 * Opaque pagination cursor returned by a previous call.
 */
cursor?: string | null,
/**
 * Optional page size; defaults to the full result set.
 */
limit?: number | null,
/**
 * Optional working directory to resolve project config layers.
 */
cwd?: string | null, };

export type PermissionProfileListResponse = { data: Array<PermissionProfileSummary>,
/**
 * Opaque cursor to pass to the next call to continue after the last item.
 * If None, there are no more items to return.
 */
nextCursor: string | null, };

export type PermissionProfileSummary = {
/**
 * Available permission profile identifier.
 */
id: string,
/**
 * Optional user-facing description for display in clients.
 */
description: string | null,
/**
 * Whether the effective requirements allow selecting this profile.
 */
allowed: boolean, };

export type PermissionsRequestApprovalParams = { threadId: string, turnId: string, itemId: string, environmentId: string | null,
/**
 * Unix timestamp (in milliseconds) when this approval request started.
 */
startedAtMs: number, cwd: LegacyAppPathString, reason: string | null, permissions: RequestPermissionProfile, };

export type PermissionsRequestApprovalResponse = { permissions: GrantedPermissionProfile, scope: PermissionGrantScope,
/**
 * Review every subsequent command in this turn before normal sandboxed execution.
 */
strictAutoReview?: boolean, };

/**
 * EXPERIMENTAL - proposed plan streaming deltas for plan items. Clients should
 * not assume concatenated deltas match the completed plan item content.
 */
export type PlanDeltaNotification = { threadId: string, turnId: string, itemId: string, delta: string, };

export type PluginAuthPolicy = "ON_INSTALL" | "ON_USE";

export type PluginAvailability = "AVAILABLE" | "DISABLED_BY_ADMIN";

export type PluginDetail = { marketplaceName: string, marketplacePath: AbsolutePathBuf | null, summary: PluginSummary, shareUrl: string | null, description: string | null, skills: Array<SkillSummary>,
/**
 * The declared onboarding skill, when the plugin and visible skill are enabled.
 */
onboardingSkill: SkillSummary | null, hooks: Array<PluginHookSummary>, apps: Array<AppSummary>, appTemplates: Array<AppTemplateSummary>, mcpServers: Array<string>, scheduledTasks: Array<ScheduledTaskSummary> | null, };

export type PluginDisabledReason = "disabled_by_admin" | "plan_not_eligible" | "required_app_unavailable" | "unknown";

export type PluginHookSummary = { key: string, eventName: HookEventName, };

export type PluginInstallParams = { marketplacePath?: AbsolutePathBuf | null, remoteMarketplaceName?: string | null,
/**
 * Client-generated identifier used to correlate one installation attempt.
 */
installAttemptId?: string | null, pluginName: string, };

export type PluginInstallPolicy = "NOT_AVAILABLE" | "AVAILABLE" | "INSTALLED_BY_DEFAULT";

export type PluginInstallPolicySource = "WORKSPACE_SETTING" | "IMPLICIT_CANONICAL_APP";

export type PluginInstallResponse = { authPolicy: PluginAuthPolicy, appsNeedingAuth: Array<AppSummary>, };

export type PluginInstalledParams = {
/**
 * Optional working directories used to discover repo marketplaces.
 */
cwds?: Array<AbsolutePathBuf> | null,
/**
 * Additional uninstalled plugin names that should be returned when present locally.
 * This is used by mention surfaces that intentionally expose install entrypoints.
 */
installSuggestionPluginNames?: Array<string> | null, };

export type PluginInstalledResponse = { marketplaces: Array<PluginMarketplaceEntry>, marketplaceLoadErrors: Array<MarketplaceLoadErrorInfo>, };

export type PluginInterface = { displayName: string | null, shortDescription: string | null, longDescription: string | null, developerName: string | null, category: string | null, capabilities: Array<string>, websiteUrl: string | null, privacyPolicyUrl: string | null, termsOfServiceUrl: string | null,
/**
 * Starter prompts for the plugin. Capped at 3 entries with a maximum of
 * 128 characters per entry.
 */
defaultPrompt: Array<string> | null, brandColor: string | null,
/**
 * Local composer icon path, resolved from the installed plugin package.
 */
composerIcon: AbsolutePathBuf | null,
/**
 * Remote composer icon URL from the plugin catalog.
 */
composerIconUrl: string | null,
/**
 * Local logo path, resolved from the installed plugin package.
 */
logo: AbsolutePathBuf | null,
/**
 * Local dark-mode logo path, resolved from the installed plugin package.
 */
logoDark: AbsolutePathBuf | null,
/**
 * Remote logo URL from the plugin catalog.
 */
logoUrl: string | null,
/**
 * Remote dark-mode logo URL from the plugin catalog.
 */
logoUrlDark: string | null,
/**
 * Local screenshot paths, resolved from the installed plugin package.
 */
screenshots: Array<AbsolutePathBuf>,
/**
 * Remote screenshot URLs from the plugin catalog.
 */
screenshotUrls: Array<string>, };

export type PluginListMarketplaceKind = "local" | "vertical" | "workspace-directory" | "shared-with-me" | "created-by-me-remote";

export type PluginListParams = {
/**
 * Optional working directories used to discover repo marketplaces. When omitted,
 * only home-scoped marketplaces and the official curated marketplace are considered.
 */
cwds?: Array<AbsolutePathBuf> | null,
/**
 * Optional marketplace kind filter. When omitted, only local marketplaces are queried, plus
 * the default remote catalog when enabled by feature flag.
 */
marketplaceKinds?: Array<PluginListMarketplaceKind> | null,
/**
 * Whether the client requests a fresh remote plugin catalog fetch.
 */
forceRefetch?: boolean, };

export type PluginListResponse = { marketplaces: Array<PluginMarketplaceEntry>, marketplaceLoadErrors: Array<MarketplaceLoadErrorInfo>, featuredPluginIds: Array<string>, };

export type PluginMarketplaceEntry = { name: string,
/**
 * Local marketplace file path when the marketplace is backed by a local file.
 * Remote-only catalog marketplaces do not have a local path.
 */
path: AbsolutePathBuf | null, interface: MarketplaceInterface | null, plugins: Array<PluginSummary>, };

export type PluginReadParams = { marketplacePath?: AbsolutePathBuf | null, remoteMarketplaceName?: string | null, pluginName: string, };

export type PluginReadResponse = { plugin: PluginDetail, };

/**
 * Runtime categories affected by this change, not just capabilities currently present.
 * Flags describe declarations before runtime policy filtering. Updates OR the old and new
 * bundle flags; enablement changes and cached reinstalls use the cached bundle; removals retain
 * the old bundle's flags.
 */
export type PluginReconcileChangedPlugin = {
/**
 * Local plugin ID (`name@marketplace`), matching `PluginSummary.id`.
 */
id: string, hasMcps: boolean, hasApps: boolean, hasHooks: boolean,
/**
 * Whether either bundle declares skill roots; not a validated inventory of enabled skills.
 */
hasSkills: boolean, };

export type PluginReconcileParams = {
/**
 * Optional client-provided reason recorded with the reconciliation attempt.
 */
reason?: string | null, };

/**
 * Bundle and installed-state changes observed by this pass, not a runtime-readiness
 * acknowledgement or a cumulative diff since the client's last request. Other metadata-only
 * changes are not listed.
 */
export type PluginReconcileResponse = {
/**
 * Plugins affected by bundle changes, enablement changes, or removals.
 * Installed-state changes compare against the previous cached snapshot, including
 * cached reinstalls. Removal hints survive cache cleanup failures; unchanged plugins are omitted.
 */
changedPlugins: Array<PluginReconcileChangedPlugin>,
/**
 * Backend remote plugin IDs whose bundle or identity update failed.
 */
failedRemotePluginIds: Array<string>,
/**
 * Subset of failures for which the requested bundle could not be materialized.
 * A previously cached version may still be available.
 */
failedMaterializationRemotePluginIds: Array<string>, };

export type PluginSearchParams = { searchTerm: string, scope?: PluginSearchScope | null, cwds?: Array<AbsolutePathBuf> | null, cursor?: string | null, limit?: number | null, };

export type PluginSearchResponse = { data: Array<PluginSearchResult>, nextCursor: string | null, };

export type PluginSearchResult = { plugin: PluginSummary, marketplaceName: string, marketplacePath: AbsolutePathBuf | null, };

export type PluginSearchScope = "global" | "workspace" | "personal";

export type PluginShareCheckoutParams = { remotePluginId: string, };

export type PluginShareCheckoutResponse = { remotePluginId: string, pluginId: string, pluginName: string, pluginPath: AbsolutePathBuf, marketplaceName: string, marketplacePath: AbsolutePathBuf, remoteVersion: string | null, };

export type PluginShareContext = { remotePluginId: string,
/**
 * Version of the remote shared plugin release when available.
 */
remoteVersion: string | null, discoverability: PluginShareDiscoverability | null, shareUrl: string | null, creatorAccountUserId: string | null, creatorName: string | null, sharePrincipals: Array<PluginSharePrincipal> | null, canPublishToWorkspace: boolean | null, };

export type PluginShareDeleteParams = { remotePluginId: string, };

export type PluginShareDeleteResponse = Record<string, never>;

export type PluginShareDiscoverability = "LISTED" | "UNLISTED" | "PRIVATE";

export type PluginShareListItem = { plugin: PluginSummary, localPluginPath: AbsolutePathBuf | null, };

export type PluginShareListParams = Record<string, never>;

export type PluginShareListResponse = { data: Array<PluginShareListItem>, };

export type PluginSharePrincipal = { principalType: PluginSharePrincipalType, principalId: string, role: PluginSharePrincipalRole, name: string, };

export type PluginSharePrincipalRole = "reader" | "editor" | "owner";

export type PluginSharePrincipalType = "user" | "group" | "workspace";

export type PluginShareSaveParams = { pluginPath: AbsolutePathBuf, remotePluginId?: string | null, discoverability?: PluginShareDiscoverability | null, shareTargets?: Array<PluginShareTarget> | null, };

export type PluginShareSaveResponse = { remotePluginId: string, shareUrl: string, canPublishToWorkspace: boolean | null, };

export type PluginShareTarget = { principalType: PluginSharePrincipalType, principalId: string, role: PluginShareTargetRole, };

export type PluginShareTargetRole = "reader" | "editor";

export type PluginShareUpdateDiscoverability = "UNLISTED" | "PRIVATE" | "LISTED";

export type PluginShareUpdateTargetsParams = { remotePluginId: string, discoverability: PluginShareUpdateDiscoverability, shareTargets: Array<PluginShareTarget>, };

export type PluginShareUpdateTargetsResponse = { principals: Array<PluginSharePrincipal>, discoverability: PluginShareDiscoverability, };

export type PluginSkillReadParams = { remoteMarketplaceName: string, remotePluginId: string, skillName: string, };

export type PluginSkillReadResponse = { contents: string | null, };

export type PluginSource = { "type": "local", path: AbsolutePathBuf, } | { "type": "git", url: string, path: string | null, refName: string | null, sha: string | null, } | { "type": "npm", package: string,
/**
 * Optional npm version or version range.
 */
version: string | null,
/**
 * Optional HTTPS registry URL. Authentication stays in the user's npm config.
 */
registry: string | null, } | { "type": "remote" };

export type PluginSummary = { id: string,
/**
 * Backend remote plugin identifier when available.
 */
remotePluginId: string | null,
/**
 * Version advertised by the remote marketplace backend when available.
 */
version: string | null,
/**
 * Version of the locally materialized plugin package when available.
 */
localVersion: string | null, name: string,
/**
 * Remote sharing context associated with this plugin when available.
 */
shareContext: PluginShareContext | null, source: PluginSource, installed: boolean,
/**
 * Unix timestamp in seconds when the remote plugin was installed, when available.
 */
installedAt: number | null, enabled: boolean, installPolicy: PluginInstallPolicy, installPolicySource: PluginInstallPolicySource | null, mustShowInstallationInterstitial: boolean | null, authPolicy: PluginAuthPolicy,
/**
 * Availability state for installing and using the plugin.
 */
availability: PluginAvailability,
/**
 * Why the remote plugin is unavailable, when provided by plugin-service.
 */
disabledReason: PluginDisabledReason | null,
/**
 * Raw plugin-service plan identifiers eligible to install the plugin.
 */
eligiblePlanTypes: Array<string> | null, interface: PluginInterface | null, keywords: Array<string>, };

export type PluginUninstallParams = { pluginId: string, };

export type PluginUninstallResponse = Record<string, never>;

export type PluginsMigration = { marketplaceName: string, pluginNames: Array<string>, };

/**
 * Final process exit notification for `process/spawn`.
 */
export type ProcessExitedNotification = {
/**
 * Client-supplied, connection-scoped `processHandle` from `process/spawn`.
 */
processHandle: string,
/**
 * Process exit code.
 */
exitCode: number,
/**
 * Buffered stdout capture.
 *
 * Empty when stdout was streamed via `process/outputDelta`.
 */
stdout: string,
/**
 * Whether stdout reached `outputBytesCap`.
 *
 * In streaming mode, stdout is empty and cap state is also reported on the
 * final stdout `process/outputDelta` notification.
 */
stdoutCapReached: boolean,
/**
 * Buffered stderr capture.
 *
 * Empty when stderr was streamed via `process/outputDelta`.
 */
stderr: string,
/**
 * Whether stderr reached `outputBytesCap`.
 *
 * In streaming mode, stderr is empty and cap state is also reported on the
 * final stderr `process/outputDelta` notification.
 */
stderrCapReached: boolean, };

/**
 * Terminate a running `process/spawn` session.
 */
export type ProcessKillParams = {
/**
 * Client-supplied, connection-scoped `processHandle` from `process/spawn`.
 */
processHandle: string, };

/**
 * Empty success response for `process/kill`.
 */
export type ProcessKillResponse = Record<string, never>;

/**
 * Base64-encoded output chunk emitted for a streaming `process/spawn` request.
 */
export type ProcessOutputDeltaNotification = {
/**
 * Client-supplied, connection-scoped `processHandle` from `process/spawn`.
 */
processHandle: string,
/**
 * Output stream this chunk belongs to.
 */
stream: ProcessOutputStream,
/**
 * Base64-encoded output bytes.
 */
deltaBase64: string,
/**
 * True on the final streamed chunk for this stream when output was
 * truncated by `outputBytesCap`.
 */
capReached: boolean, };

/**
 * Stream label for `process/outputDelta` notifications.
 */
export type ProcessOutputStream = "stdout" | "stderr";

/**
 * Resize a running PTY-backed `process/spawn` session.
 */
export type ProcessResizePtyParams = {
/**
 * Client-supplied, connection-scoped `processHandle` from `process/spawn`.
 */
processHandle: string,
/**
 * New PTY size in character cells.
 */
size: ProcessTerminalSize, };

/**
 * Empty success response for `process/resizePty`.
 */
export type ProcessResizePtyResponse = Record<string, never>;

/**
 * Spawn a standalone process (argv vector) without a Codex sandbox on the host
 * where the app server is running.
 *
 * `process/spawn` returns after the process has started and the connection-scoped
 * `processHandle` has been registered. Process output and exit are reported via
 * `process/outputDelta` and `process/exited` notifications.
 */
export type ProcessSpawnParams = {
/**
 * Command argv vector. Empty arrays are rejected.
 */
command: Array<string>,
/**
 * Client-supplied, connection-scoped process handle.
 *
 * Duplicate active handles are rejected on the same connection. The same
 * handle can be reused after the prior process exits.
 */
processHandle: string,
/**
 * Absolute working directory for the process.
 */
cwd: AbsolutePathBuf,
/**
 * Enable PTY mode.
 *
 * This implies `streamStdin` and `streamStdoutStderr`.
 */
tty?: boolean,
/**
 * Allow follow-up `process/writeStdin` requests to write stdin bytes.
 */
streamStdin?: boolean,
/**
 * Stream stdout/stderr via `process/outputDelta` notifications.
 *
 * Streamed bytes are not duplicated into the `process/exited` notification.
 */
streamStdoutStderr?: boolean,
/**
 * Optional per-stream stdout/stderr capture cap in bytes.
 *
 * When omitted, the server default applies. Set to `null` to disable the
 * cap.
 */
outputBytesCap?: number | null,
/**
 * Optional timeout in milliseconds.
 *
 * When omitted, the server default applies. Set to `null` to disable the
 * timeout.
 */
timeoutMs?: number | null,
/**
 * Optional environment overrides merged into the app-server process
 * environment.
 *
 * Matching names override inherited values. Set a key to `null` to unset
 * an inherited variable.
 */
env?: { [key in string]?: string | null } | null,
/**
 * Optional initial PTY size in character cells. Only valid when `tty` is
 * true.
 */
size?: ProcessTerminalSize | null, };

/**
 * Successful response for `process/spawn`.
 */
export type ProcessSpawnResponse = Record<string, never>;

/**
 * PTY size in character cells for `process/spawn` PTY sessions.
 */
export type ProcessTerminalSize = {
/**
 * Terminal height in character cells.
 */
rows: number,
/**
 * Terminal width in character cells.
 */
cols: number, };

/**
 * Write stdin bytes to a running `process/spawn` session, close stdin, or
 * both.
 */
export type ProcessWriteStdinParams = {
/**
 * Client-supplied, connection-scoped `processHandle` from `process/spawn`.
 */
processHandle: string,
/**
 * Optional base64-encoded stdin bytes to write.
 */
deltaBase64?: string | null,
/**
 * Close stdin after writing `deltaBase64`, if present.
 */
closeStdin?: boolean, };

/**
 * Empty success response for `process/writeStdin`.
 */
export type ProcessWriteStdinResponse = Record<string, never>;

export type Project = { id: string, name: string, roots: Array<ProjectRoot>, metadata: { [key in string]?: string }, position: number, createdAt: number, updatedAt: number,
/**
 * Newest non-archived member thread's recency, in Unix seconds; null when none exist.
 */
recencyAt: number | null, };

export type ProjectChangeType = "created" | "updated" | "deleted";

export type ProjectChangedNotification = { projectId: string, changeType: ProjectChangeType, };

export type ProjectCreateParams = { name: string, roots: Array<ProjectRoot>, metadata?: { [key in string]?: string } | null, idempotencyKey: string, };

export type ProjectCreateResponse = { project: Project, };

export type ProjectDeleteParams = { projectId: string, };

export type ProjectDeleteResponse = Record<string, never>;

export type ProjectImportParams = { name: string, roots: Array<ProjectRoot>, metadata?: { [key in string]?: string } | null, threads?: Array<string> | null, idempotencyKey: string, };

export type ProjectImportResponse = { project: Project, };

export type ProjectListParams = { cursor?: string | null, limit?: number | null,
/**
 * Defaults to position. Recency sorting always places empty projects last.
 */
sortKey?: ProjectSortKey | null,
/**
 * Requires sortKey. Defaults to asc for position and desc for recencyAt.
 */
sortDirection?: SortDirection | null, };

export type ProjectListResponse = { data: Array<Project>, nextCursor: string | null, };

export type ProjectMoveParams = { projectId: string, beforeProjectId?: string | null, };

export type ProjectMoveResponse = Record<string, never>;

export type ProjectReadParams = { projectId: string, };

export type ProjectReadResponse = { project: Project, };

export type ProjectRoot = { path: AbsolutePathBuf, };

export type ProjectSortKey = "position" | "recencyAt";

export type ProjectUpdateParams = { projectId: string, name?: string | null, roots?: Array<ProjectRoot> | null, metadata?: { [key in string]?: string } | null, };

export type ProjectUpdateResponse = { project: Project, };

export type QueuedSubmission = { id: string, input: Array<UserInput>, clientUserMessageId: string, };

export type RateLimitReachedType = "rate_limit_reached" | "workspace_owner_credits_depleted" | "workspace_member_credits_depleted" | "workspace_owner_usage_limit_reached" | "workspace_member_usage_limit_reached";

export type RateLimitResetCredit = {
/**
 * Opaque backend identifier for this reset credit.
 */
id: string, resetType: RateLimitResetType, status: RateLimitResetCreditStatus,
/**
 * Unix timestamp in seconds when the credit was granted.
 */
grantedAt: number,
/**
 * Unix timestamp in seconds when the credit expires, or `null` if it does not expire.
 */
expiresAt: number | null,
/**
 * Backend-provided display title for this credit, or `null` when unavailable.
 */
title: string | null,
/**
 * Backend-provided display description for this credit, or `null` when unavailable.
 */
description: string | null, };

export type RateLimitResetCreditStatus = "available" | "redeeming" | "redeemed" | "unknown";

export type RateLimitResetCreditsSummary = { availableCount: bigint,
/**
 * Detail rows for available reset credits, when the backend provides them.
 *
 * `null` means only `availableCount` is known, while an empty array means details were fetched
 * and no available credits were returned. The backend may cap this list, so its length can be
 * less than `availableCount`.
 */
credits: Array<RateLimitResetCredit> | null, };

export type RateLimitResetType = "codexRateLimits" | "unknown";

export type RateLimitSnapshot = { limitId: string | null, limitName: string | null,
/**
 * Normal model whose display name and reasoning options describe this quota alias.
 */
normalModelSlug: string | null, primary: RateLimitWindow | null, secondary: RateLimitWindow | null, credits: CreditsSnapshot | null, individualLimit: SpendControlLimitSnapshot | null,
/**
 * Backend-reported spend-control state. `None` is unavailable, not a sparse-update recovery.
 */
spendControlReached: boolean | null, planType: PlanType | null, rateLimitReachedType: RateLimitReachedType | null, };

export type RateLimitWindow = { usedPercent: number, windowDurationMins: number | null, resetsAt: number | null, };

/**
 * Internal-only notification containing the exact usage from one upstream
 * Responses API completion.
 */
export type RawResponseCompletedNotification = { threadId: string, turnId: string, responseId: string, usage: TokenUsageBreakdown | null, usageMetadata: ResponseUsageMetadata | null, };

export type RawResponseItemCompletedNotification = { threadId: string, turnId: string, item: ResponseItem, };

export type ReasoningEffortOption = { reasoningEffort: ReasoningEffort, description: string, };

export type ReasoningSummaryPartAddedNotification = { threadId: string, turnId: string, itemId: string, summaryIndex: number, };

export type ReasoningSummaryTextDeltaNotification = { threadId: string, turnId: string, itemId: string, delta: string, summaryIndex: number, };

export type ReasoningTextDeltaNotification = { threadId: string, turnId: string, itemId: string, delta: string, contentIndex: number, };

export type RemoteControlClient = { clientId: string, displayName: string | null, deviceType: string | null, platform: string | null, osVersion: string | null, deviceModel: string | null, appVersion: string | null, lastSeenAt: bigint | null, };

export type RemoteControlClientsListOrder = "asc" | "desc";

export type RemoteControlClientsListParams = { environmentId: string, cursor?: string | null, limit?: number | null, order?: RemoteControlClientsListOrder | null, };

export type RemoteControlClientsListResponse = { data: Array<RemoteControlClient>, nextCursor: string | null, };

export type RemoteControlClientsRevokeParams = { environmentId: string, clientId: string, };

export type RemoteControlClientsRevokeResponse = Record<string, never>;

export type RemoteControlConnectionStatus = "disabled" | "connecting" | "connected" | "errored";

export type RemoteControlDisableParams = { ephemeral?: boolean, };

export type RemoteControlDisableResponse = { status: RemoteControlConnectionStatus, serverName: string, installationId: string, environmentId: string | null, };

export type RemoteControlEnableParams = { ephemeral?: boolean, };

export type RemoteControlEnableResponse = { status: RemoteControlConnectionStatus, serverName: string, installationId: string, environmentId: string | null, };

export type RemoteControlPairingStartParams = { manualCode?: boolean, };

export type RemoteControlPairingStartResponse = { pairingCode: string, manualPairingCode: string | null, environmentId: string, expiresAt: bigint, };

export type RemoteControlPairingStatusParams = { pairingCode?: string | null, manualPairingCode?: string | null, };

export type RemoteControlPairingStatusResponse = { claimed: boolean, };

/**
 * Current remote-control connection status and remote identity exposed to clients.
 */
export type RemoteControlStatusChangedNotification = { status: RemoteControlConnectionStatus, serverName: string, installationId: string, environmentId: string | null, };

export type RemoteControlStatusReadResponse = { status: RemoteControlConnectionStatus, serverName: string, installationId: string, environmentId: string | null, };

export type RequestHeader = { name: string, value: string, };

export type RequestPermissionProfile = { network: AdditionalNetworkPermissions | null, fileSystem: AdditionalFileSystemPermissions | null, };

export type ResidencyRequirement = "us";

/**
 * Usage metadata reported for one upstream response.
 */
export type ResponseUsageMetadata = { amount: string | null, metadata: JsonValue | null, };

export type ReviewDelivery = "inline" | "detached";

export type ReviewStartParams = { threadId: string, target: ReviewTarget,
/**
 * Where to run the review: inline (default) on the current thread or
 * detached on a new thread (returned in `reviewThreadId`).
 * Detached delivery is deprecated and emits `deprecationNotice`.
 * Use `thread/start` followed by an inline review for a separate review thread.
 */
delivery?: ReviewDelivery | null, };

export type ReviewStartResponse = { turn: Turn,
/**
 * Identifies the thread where the review runs.
 *
 * For inline reviews, this is the original thread id.
 * For detached reviews, this is the id of the new review thread.
 */
reviewThreadId: string, };

export type ReviewTarget = { "type": "uncommittedChanges" } | { "type": "baseBranch", branch: string, } | { "type": "commit", sha: string,
/**
 * Optional human-readable label (e.g., commit subject) for UIs.
 */
title: string | null, } | { "type": "custom", instructions: string, };

/**
 * Acknowledges the compression trigger, not completion. Existing maintenance
 * locks and cooldowns can cause the background pass to skip without doing work.
 */
export type RolloutCompressResponse = Record<string, never>;

export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export type SandboxPolicy = { "type": "dangerFullAccess" } | { "type": "readOnly", networkAccess: boolean, } | { "type": "externalSandbox", networkAccess: NetworkAccess, } | { "type": "workspaceWrite", writableRoots: Array<AbsolutePathBuf>, networkAccess: boolean, excludeTmpdirEnvVar: boolean, excludeSlashTmp: boolean, };

export type SandboxWorkspaceWrite = { writable_roots: Array<string>, network_access: boolean, exclude_tmpdir_env_var: boolean, exclude_slash_tmp: boolean, };

export type ScheduledTaskSchedule = { "type": "hourly", intervalHours: number, days: Array<ScheduledTaskWeekday> | null, } | { "type": "daily", time: string, } | { "type": "weekdays", time: string, } | { "type": "weekly", days: Array<ScheduledTaskWeekday>, time: string, };

export type ScheduledTaskSummary = { key: string, name: string, prompt: string, schedule: ScheduledTaskSchedule, };

export type ScheduledTaskWeekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

/**
 * A user-selected root that can expose one or more runtime capabilities.
 */
export type SelectedCapabilityRoot = {
/**
 * Stable identifier supplied by the capability selection platform.
 */
id: string,
/**
 * Where the selected root can be resolved.
 */
location: CapabilityRootLocation, };

export type SendAddCreditsNudgeEmailParams = { creditType: AddCreditsNudgeCreditType, };

export type SendAddCreditsNudgeEmailResponse = { status: AddCreditsNudgeEmailStatus, };

export type ServerDiagnosticsGauge = { name: string, value: number, };

export type ServerDiagnosticsParams = Record<string, never>;

export type ServerDiagnosticsProcess = { id: number, residentMemoryBytes: number | null, physicalFootprintBytes: number | null, };

export type ServerDiagnosticsResponse = { process: ServerDiagnosticsProcess, gauges: Array<ServerDiagnosticsGauge>, };

export type ServerRequestResolvedNotification = { threadId: string, requestId: RequestId, };

export type SessionMigration = { path: string, cwd: string, title: string | null, };

export type SessionSource = "cli" | "vscode" | "exec" | "appServer" | { "custom": string } | { "subAgent": SubAgentSource } | "unknown";

export type SkillDependencies = { tools: Array<SkillToolDependency>, };

export type SkillErrorInfo = { path: string, message: string, };

export type SkillInterface = { displayName?: string, shortDescription?: string, iconSmall?: AbsolutePathBuf, iconLarge?: AbsolutePathBuf,
/**
 * Remote small icon URL from the plugin catalog.
 */
iconSmallUrl: string | null,
/**
 * Remote large icon URL from the plugin catalog.
 */
iconLargeUrl: string | null, brandColor?: string, defaultPrompt?: string, };

export type SkillMetadata = { name: string, description: string,
/**
 * Legacy short_description from SKILL.md. Prefer SKILL.json interface.short_description.
 */
shortDescription?: string, interface?: SkillInterface, dependencies?: SkillDependencies, path: LegacyAppPathString, scope: SkillScope, enabled: boolean,
/**
 * Owning plugin ID, matching `PluginSummary.id`, when known.
 */
pluginId: string | null, };

export type SkillMigration = { name: string, };

export type SkillScope = "user" | "repo" | "system" | "admin";

export type SkillSummary = { name: string, description: string, shortDescription: string | null, interface: SkillInterface | null, path: LegacyAppPathString | null, enabled: boolean, };

export type SkillToolDependency = { type: string, value: string, description?: string, transport?: string, command?: string, url?: string, };

/**
 * Notification emitted when watched local skill files change.
 *
 * Treat this as an invalidation signal and re-run `skills/list` with the
 * client's current parameters when refreshed skill metadata is needed.
 */
export type SkillsChangedNotification = Record<string, never>;

export type SkillsConfigWriteParams = {
/**
 * Path-based selector.
 */
path?: AbsolutePathBuf | null,
/**
 * Name-based selector.
 */
name?: string | null, enabled: boolean, };

export type SkillsConfigWriteResponse = { effectiveEnabled: boolean, };

export type SkillsExtraRootsSetParams = { extraRoots: Array<AbsolutePathBuf>, };

export type SkillsExtraRootsSetResponse = Record<string, never>;

export type SkillsListEntry = { cwd: string, skills: Array<SkillMetadata>, errors: Array<SkillErrorInfo>, };

export type SkillsListParams = {
/**
 * When empty, defaults to the current session working directory.
 */
cwds?: Array<string>,
/**
 * When true, bypass the skills cache and re-scan skills from disk.
 */
forceReload?: boolean, };

export type SkillsListResponse = { data: Array<SkillsListEntry>, };

export type SortDirection = "asc" | "desc";

export type SpendControlLimitSnapshot = { limit: string, used: string, remainingPercent: number, resetsAt: number, };

export type StrictReviewRequiredNotification = { threadId: string, turnId: string,
/**
 * Unix timestamp (in milliseconds) when this review started.
 */
startedAtMs: number, };

export type SubAgentActivityKind = "started" | "interacted" | "interrupted" | "completed";

export type SubagentMigration = { name: string, };

export type TerminalInteractionNotification = { threadId: string, turnId: string, itemId: string, processId: string, stdin: string, };

export type TextElement = {
/**
 * Byte range in the parent `text` buffer that this element occupies.
 */
byteRange: ByteRange,
/**
 * Optional human-readable placeholder for the element, displayed in the UI.
 */
placeholder: string | null, };

export type TextPosition = {
/**
 * 1-based line number.
 */
line: number,
/**
 * 1-based column number (in Unicode scalar values).
 */
column: number, };

export type TextRange = { start: TextPosition, end: TextPosition, };

export type Thread = {
/**
 * Identifier for this thread. Codex-generated thread IDs are UUIDv7.
 */
id: string,
/**
 * Current environments for a loaded thread, in priority order, primary first.
 * `null` means the thread is not loaded or the server does not expose its selection.
 * An empty list means no environments are selected. This does not report connection status.
 */
environments: Array<ThreadEnvironment> | null,
/**
 * Optional implementation-specific thread data.
 */
extra: ThreadExtra | null,
/**
 * Session id shared by threads that belong to the same session tree.
 */
sessionId: string,
/**
 * Source thread id when this thread was created by forking another thread.
 */
forkedFromId: string | null,
/**
 * The ID of the parent thread. This will only be set if this thread is a subagent.
 */
parentThreadId: string | null,
/**
 * Usually the first user message in the thread, if available.
 */
preview: string,
/**
 * Whether the thread is ephemeral and should not be materialized on disk.
 */
ephemeral: boolean,
/**
 * The independently persisted section selected for this thread, if any.
 */
section: ThreadSection | null,
/**
 * Unix timestamp in seconds when the thread entered its current section.
 */
sectionEnteredAt: number | null,
/**
 * Canonical project assignment owned by app-server, if any.
 */
projectId: string | null,
/**
 * Persisted thread history contract selected when this thread was created.
 */
historyMode: ThreadHistoryMode,
/**
 * Model provider used for this thread (for example, 'openai').
 */
modelProvider: string,
/**
 * Current configured model when loaded, otherwise the latest persisted model.
 * Null when unavailable. This is not per-turn execution telemetry.
 */
model: string | null,
/**
 * Current configured reasoning effort when loaded, otherwise the latest persisted effort.
 * Null when unset or unavailable. This is not per-turn execution telemetry.
 */
reasoningEffort: ReasoningEffort | null,
/**
 * Unix timestamp (in seconds) when the thread was created.
 */
createdAt: number,
/**
 * Unix timestamp (in seconds) when the thread was last updated.
 */
updatedAt: number,
/**
 * Unix timestamp (in seconds) used for thread recency ordering.
 */
recencyAt: number | null,
/**
 * Current runtime status for the thread.
 */
status: ThreadStatus,
/**
 * [UNSTABLE] Path to the thread on disk.
 */
path: string | null,
/**
 * Working directory captured for the thread.
 */
cwd: AbsolutePathBuf,
/**
 * Version of the CLI that created the thread.
 */
cliVersion: string,
/**
 * Originator recorded when the thread was created, independent of its current client or executor.
 * Null when the recorded originator is unavailable.
 */
originator: string | null,
/**
 * Origin of the thread (CLI, VSCode, codex exec, codex app-server, etc.).
 */
source: SessionSource,
/**
 * Whether the app server accepts direct turn input for this loaded thread.
 * `None` means the capability is unavailable, such as for an unloaded stored thread.
 */
canAcceptDirectInput: boolean | null,
/**
 * Optional analytics source classification for this thread.
 */
threadSource: ThreadSource | null,
/**
 * Optional random unique nickname assigned to an AgentControl-spawned sub-agent.
 */
agentNickname: string | null,
/**
 * Optional role (agent_role) assigned to an AgentControl-spawned sub-agent.
 */
agentRole: string | null,
/**
 * Optional Git metadata captured when the thread was created.
 */
gitInfo: GitInfo | null,
/**
 * Optional user-facing thread title.
 */
name: string | null,
/**
 * Saved Daybreak choice, independent of turn execution. Null if unset.
 */
daybreakEnabled: boolean | null,
/**
 * Only populated on `thread/resume`, `thread/fork`, and `thread/read`
 * (when `includeTurns` is true) responses.
 * For all other responses and notifications returning a Thread,
 * the turns field will be an empty list.
 */
turns: Array<Turn>, };

export type ThreadActiveFlag = "waitingOnApproval" | "waitingOnUserInput";

export type ThreadApproveGuardianDeniedActionParams = { threadId: string,
/**
 * Serialized `codex_protocol::protocol::GuardianAssessmentEvent`.
 */
event: JsonValue, };

export type ThreadApproveGuardianDeniedActionResponse = Record<string, never>;

export type ThreadArchiveParams = { threadId: string, };

export type ThreadArchiveResponse = Record<string, never>;

export type ThreadArchivedNotification = { threadId: string, };

/**
 * An independently persisted attachment associated with a thread.
 */
export type ThreadAttachment = { id: string, attachmentType: string, identityKey: string, payload: JsonValue, createdAt: number, };

/**
 * Result of attempting to associate an attachment with a thread.
 */
export type ThreadAttachmentAddOutcome = "created" | "existing";

/**
 * Parameters for creating or locating an attachment on its owning thread.
 */
export type ThreadAttachmentAddParams = { threadId: string, attachmentType: string, identityKey: string, payload: JsonValue, };

/**
 * The created or existing attachment.
 */
export type ThreadAttachmentAddResponse = { outcome: ThreadAttachmentAddOutcome, attachment: ThreadAttachment, };

/**
 * Parameters for listing attachments from one thread.
 */
export type ThreadAttachmentListParams = { threadId: string, cursor?: string | null, limit?: number | null, };

/**
 * One page of attachments associated with the requested thread.
 */
export type ThreadAttachmentListResponse = { data: Array<ThreadAttachment>, nextCursor: string | null, };

/**
 * The persisted attachment change represented by a notification.
 */
export type ThreadAttachmentOperation = "created" | "deleted";

/**
 * A thread that currently owns an attachment with the requested identity.
 */
export type ThreadAttachmentOwner = { threadId: string,
/**
 * Whether the owning thread is archived, not whether it is currently executing a turn.
 */
archived: boolean, };

/**
 * Parameters for reverse lookup by attachment identity within this server's store.
 */
export type ThreadAttachmentOwnerListParams = { attachmentType: string, identityKey: string,
/**
 * Omitted or null returns all matches; false returns non-archived threads only.
 */
archived?: boolean | null, cursor?: string | null, limit?: number | null, };

/**
 * One page of matching owners, including threads without their own user messages.
 */
export type ThreadAttachmentOwnerListResponse = { data: Array<ThreadAttachmentOwner>, nextCursor: string | null, };

/**
 * Parameters for deleting an attachment by its stable thread-local identity.
 */
export type ThreadAttachmentRemoveParams = { threadId: string, attachmentType: string, identityKey: string, };

/**
 * Successful deletion does not return additional attachment data.
 */
export type ThreadAttachmentRemoveResponse = Record<string, never>;

/**
 * Notification published after a thread attachment is created or deleted.
 */
export type ThreadAttachmentUpdatedNotification = { threadId: string, attachmentType: string, identityKey: string, attachmentId: string, operation: ThreadAttachmentOperation, };

export type ThreadBackgroundTerminal = { itemId: string, processId: string, command: string, cwd: LegacyAppPathString, osPid: number | null, cpuPercent: number | null, rssKb: bigint | null, };

export type ThreadBackgroundTerminalsCleanParams = { threadId: string, };

export type ThreadBackgroundTerminalsCleanResponse = Record<string, never>;

export type ThreadBackgroundTerminalsListParams = { threadId: string,
/**
 * Opaque pagination cursor returned by a previous call.
 */
cursor?: string | null,
/**
 * Optional page size.
 */
limit?: number | null, };

export type ThreadBackgroundTerminalsListResponse = { data: Array<ThreadBackgroundTerminal>,
/**
 * Opaque cursor to pass to the next call to continue after the last item.
 * If None, there are no more items to return.
 */
nextCursor: string | null, };

export type ThreadBackgroundTerminalsTerminateParams = { threadId: string, processId: string, };

export type ThreadBackgroundTerminalsTerminateResponse = { terminated: boolean, };

export type ThreadClosedNotification = { threadId: string, };

export type ThreadCompactStartParams = { threadId: string, };

export type ThreadCompactStartResponse = Record<string, never>;

/**
 * Parameters for `thread/decrement_elicitation`.
 */
export type ThreadDecrementElicitationParams = {
/**
 * Thread whose out-of-band elicitation counter should be decremented.
 */
threadId: string, };

/**
 * Response for `thread/decrement_elicitation`.
 */
export type ThreadDecrementElicitationResponse = {
/**
 * Current out-of-band elicitation count after the decrement.
 */
count: bigint,
/**
 * Whether timeout accounting remains paused after applying the decrement.
 */
paused: boolean, };

export type ThreadDeleteParams = { threadId: string, };

export type ThreadDeleteResponse = Record<string, never>;

export type ThreadDeletedNotification = { threadId: string, };

/**
 * An environment selected by a loaded thread, independent of connection status.
 */
export type ThreadEnvironment = { environmentId: string, cwd: LegacyAppPathString, runtimeWorkspaceRoots: Array<LegacyAppPathString>, };

/**
 * Extra app-server data for a thread.
 */
export type ThreadExtra = Record<string, never>;

/**
 * There are two ways to fork a thread:
 * 1. By thread_id: load the thread from disk by thread_id and fork it into a new thread.
 * 2. By path: load the thread from disk by path and fork it into a new thread.
 *
 * If using a non-empty path, the thread_id param will be ignored.
 * Empty string path values are treated as absent.
 *
 * Prefer using thread_id whenever possible.
 */
export type ThreadForkParams = { threadId: string,
/**
 * Start from the loaded parent's effective config, tools, environments, and
 * persisted history to maximize prompt-cache reuse. Requires a loaded,
 * persisted parent and `ephemeral: true`. Enables `features.reasoning_effort_override`
 * on the fork. Only `config.thread_unload_delay_secs` may override the inherited
 * config. Cannot be combined with `path`, `lastTurnId`, or `beforeTurnId`.
 */
experimentalPredictionMode?: boolean,
/**
 * Disable MCP servers in prediction mode when the inherited window uses incremental tools on Responses Lite.
 * Requires `experimentalPredictionMode: true`.
 */
experimentalDisablePredictionMcp?: boolean,
/**
 * Optional last turn id to fork through, inclusive.
 *
 * When specified, turns after `last_turn_id` are omitted from the fork.
 * The referenced turn cannot be in progress.
 */
lastTurnId?: string | null,
/**
 * Optional turn id to fork before, excluding that turn and all later turns.
 * Cannot be combined with `last_turn_id`.
 */
beforeTurnId?: string | null,
/**
 * [UNSTABLE] Specify the rollout path to fork from.
 * If specified, the thread_id param will be ignored.
 */
path?: string | null,
/**
 * Configuration overrides for the forked thread, if any.
 */
model?: string | null, modelProvider?: string | null, serviceTier?: string | null | null, cwd?: string | null,
/**
 * Replace the thread's runtime workspace roots. Paths must be absolute.
 */
runtimeWorkspaceRoots?: Array<AbsolutePathBuf> | null, approvalPolicy?: AskForApproval | null,
/**
 * Override where approval requests are routed for review on this thread
 * and subsequent turns.
 */
approvalsReviewer?: ApprovalsReviewer | null, sandbox?: SandboxMode | null,
/**
 * Named profile id for the forked thread. Cannot be combined with
 * `sandbox`.
 */
permissions?: string | null, config?: { [key in string]?: JsonValue } | null, baseInstructions?: string | null, developerInstructions?: string | null, ephemeral?: boolean,
/**
 * Optional client-supplied analytics source classification for this forked thread.
 */
threadSource?: ThreadSource | null,
/**
 * When true, return only thread metadata and live fork state without
 * populating `thread.turns`. This is useful when the client plans to call
 * `thread/turns/list` immediately after forking. Full-history hydration
 * is deprecated for paginated threads; use this with `thread/turns/list`
 * and `thread/items/list` instead.
 */
excludeTurns?: boolean,
/**
 * When true, carry the source thread's current goal into the fork without
 * starting its initial automatic continuation. The next explicit turn owns
 * the goal lifecycle, and normal automatic continuation resumes after it.
 */
deferGoalContinuation?: boolean, };

export type ThreadForkResponse = { thread: Thread, model: string, modelProvider: string, serviceTier: string | null,
/**
 * Saved list of disabled plugin IDs. Does not yet filter plugin capabilities.
 */
disabledPluginIds: Array<string>, cwd: AbsolutePathBuf,
/**
 * Thread-scoped runtime workspace roots used to materialize
 * `:workspace_roots`.
 */
runtimeWorkspaceRoots: Array<AbsolutePathBuf>,
/**
 * Environment-native paths to instruction source files currently loaded for this thread.
 */
instructionSources: Array<LegacyAppPathString>, approvalPolicy: AskForApproval,
/**
 * Reviewer currently used for approval requests on this thread.
 */
approvalsReviewer: ApprovalsReviewer,
/**
 * Legacy sandbox policy retained for compatibility. Experimental clients
 * should prefer `activePermissionProfile` for profile provenance.
 */
sandbox: SandboxPolicy,
/**
 * Named or implicit built-in profile that produced the active
 * permissions, when known.
 */
activePermissionProfile: ActivePermissionProfile | null, reasoningEffort: ReasoningEffort | null,
/**
 * @deprecated Always `explicitRequestOnly`. Use `reasoningEffort` for Ultra behavior.
 */
multiAgentMode: MultiAgentMode, };

export type ThreadGoal = { threadId: string, objective: string, status: ThreadGoalStatus, tokenBudget: number | null, tokensUsed: number, timeUsedSeconds: number, createdAt: number, updatedAt: number, };

export type ThreadGoalClearParams = { threadId: string,
/**
 * Missing provenance does not supply user authorization.
 */
origin?: ThreadGoalMutationOrigin | null, };

export type ThreadGoalClearResponse = { cleared: boolean, };

export type ThreadGoalClearedNotification = { threadId: string, };

export type ThreadGoalGetParams = { threadId: string, };

export type ThreadGoalGetResponse = { goal: ThreadGoal | null, };

/**
 * Distinguishes explicit user actions from automatic goal lifecycle mutations.
 */
export type ThreadGoalMutationOrigin = "user" | "automatic";

export type ThreadGoalSetParams = { threadId: string,
/**
 * Missing provenance does not supply user authorization.
 */
origin?: ThreadGoalMutationOrigin | null, objective?: string | null, status?: ThreadGoalStatus | null, tokenBudget?: number | null, };

export type ThreadGoalSetResponse = { goal: ThreadGoal, };

export type ThreadGoalStatus = "active" | "paused" | "blocked" | "usageLimited" | "budgetLimited" | "complete";

export type ThreadGoalUpdatedNotification = { threadId: string, turnId: string | null, goal: ThreadGoal, };

export type ThreadHistoryMode = "legacy" | "paginated";

/**
 * Parameters for `thread/increment_elicitation`.
 */
export type ThreadIncrementElicitationParams = {
/**
 * Thread whose out-of-band elicitation counter should be incremented.
 */
threadId: string, };

/**
 * Response for `thread/increment_elicitation`.
 */
export type ThreadIncrementElicitationResponse = {
/**
 * Current out-of-band elicitation count after the increment.
 */
count: bigint,
/**
 * Whether timeout accounting is paused after applying the increment.
 */
paused: boolean, };

export type ThreadInjectItemsParams = { threadId: string,
/**
 * Raw Responses API items to append to the thread's model-visible history.
 */
items: Array<JsonValue>, };

export type ThreadInjectItemsResponse = Record<string, never>;

export type ThreadItem = { "type": "userMessage", id: string, clientId: string | null, content: Array<UserInput>, } | { "type": "hookPrompt", id: string, fragments: Array<HookPromptFragment>, } | { "type": "agentMessage", id: string, text: string, phase: MessagePhase | null, memoryCitation: MemoryCitation | null, delivery: AgentMessageDelivery | null, questions: Array<AsyncUserInputQuestion> | null, } | { "type": "functionCallOutput", id: string, name: string, namespace: string | null, output: FunctionCallOutputBody, } | { "type": "plan", id: string, text: string, } | { "type": "reasoning", id: string, summary: Array<string>, content: Array<string>, } | { "type": "commandExecution", id: string,
/**
 * Trusted first-party plugin id when this command resolves to one plugin script.
 */
pluginId: string | null,
/**
 * Safe plugin-relative path when this command resolves to one plugin script.
 */
scriptPath: string | null,
/**
 * The command to be executed.
 */
command: string,
/**
 * The command's working directory.
 */
cwd: LegacyAppPathString,
/**
 * Identifier for the underlying PTY process (when available).
 */
processId: string | null, source: CommandExecutionSource, status: CommandExecutionStatus,
/**
 * A best-effort parsing of the command to understand the action(s) it will perform.
 * This returns a list of CommandAction objects because a single shell command may
 * be composed of many commands piped together.
 */
commandActions: Array<CommandAction>,
/**
 * The command's output, aggregated from stdout and stderr.
 */
aggregatedOutput: string | null,
/**
 * The command's exit code.
 */
exitCode: number | null,
/**
 * The duration of the command execution in milliseconds.
 */
durationMs: number | null, } | { "type": "fileChange", id: string, changes: Array<FileUpdateChange>, status: PatchApplyStatus, } | { "type": "mcpToolCall", id: string, server: string, tool: string, status: McpToolCallStatus, arguments: JsonValue, appContext: McpToolCallAppContext | null,
/**
 * Legacy compatibility field; prefer `mcpAppUi.resourceUri` when available.
 */
mcpAppResourceUri?: string,
/**
 * Presentation captured from the invoked descriptor; absent in older history.
 */
mcpAppUi: McpAppUi | null, pluginId: string | null, readOnlyHint: boolean | null, result: McpToolCallResult | null, error: McpToolCallError | null,
/**
 * The duration of the MCP tool call in milliseconds.
 */
durationMs: number | null, } | { "type": "dynamicToolCall", id: string, namespace: string | null, tool: string, arguments: JsonValue, status: DynamicToolCallStatus, contentItems: Array<DynamicToolCallOutputContentItem> | null, success: boolean | null,
/**
 * The duration of the dynamic tool call in milliseconds.
 */
durationMs: number | null, } | { "type": "collabAgentToolCall",
/**
 * Unique identifier for this collab tool call.
 */
id: string,
/**
 * Name of the collab tool that was invoked.
 */
tool: CollabAgentTool,
/**
 * Current status of the collab tool call.
 */
status: CollabAgentToolCallStatus,
/**
 * Thread ID of the agent issuing the collab request.
 */
senderThreadId: string,
/**
 * Thread ID of the receiving agent, when applicable. In case of spawn operation,
 * this corresponds to the newly spawned agent.
 */
receiverThreadIds: Array<string>,
/**
 * Prompt text sent as part of the collab tool call, when available.
 */
prompt: string | null,
/**
 * Model requested for the spawned agent, when applicable.
 */
model: string | null,
/**
 * Reasoning effort requested for the spawned agent, when applicable.
 */
reasoningEffort: ReasoningEffort | null,
/**
 * Last known status of the target agents, when available.
 */
agentsStates: { [key in string]?: CollabAgentState }, } | { "type": "subAgentActivity",
/**
 * Resolved model at sub-agent creation; absent from older records and other activities.
 */
model: string | null,
/**
 * Resolved reasoning effort at sub-agent creation, when known.
 */
reasoningEffort: ReasoningEffort | null, id: string, kind: SubAgentActivityKind, agentThreadId: string, agentPath: string, } | { "type": "webSearch" } & WebSearchItem | { "type": "imageView", id: string, path: LegacyAppPathString, } | { "type": "sleep" } & SleepItem | { "type": "imageGeneration" } & ImageGenerationItem | { "type": "enteredReviewMode", id: string, review: string, } | { "type": "exitedReviewMode", id: string, review: string, } | { "type": "contextCompaction", id: string, };

export type ThreadItemEntry = {
/**
 * Turn containing this item.
 */
turnId: string, item: ThreadItem,
/**
 * Unix timestamp (milliseconds) when the item started, if recorded by the producer.
 */
startedAtMs: number | null,
/**
 * Unix timestamp (milliseconds) when the item completed, if recorded by the producer.
 */
completedAtMs: number | null, };

/**
 * An exclusive item position within the requested visible turn.
 */
export type ThreadItemsListAnchor = { "type": "item", itemId: string, };

/**
 * Starting position for an item-history page.
 */
export type ThreadItemsListCursor = string | ThreadItemsListAnchor;

export type ThreadItemsListParams = { threadId: string,
/**
 * Optional turn id to filter by. When omitted, returns items across the thread.
 */
turnId?: string | null,
/**
 * Opaque continuation cursor or an exclusive item anchor in the requested visible turn.
 * An item anchor requires a non-empty `turnId`; ascending (the default) returns items
 * after it, and descending returns items before it. Continue with the returned string cursor.
 */
cursor?: ThreadItemsListCursor | null,
/**
 * Optional item page size.
 */
limit?: number | null,
/**
 * Optional item pagination direction; defaults to ascending.
 */
sortDirection?: SortDirection | null, };

export type ThreadItemsListResponse = { data: Array<ThreadItemEntry>,
/**
 * Opaque cursor to pass to the next call to continue after the last item.
 * if None, there are no more items to return.
 */
nextCursor: string | null,
/**
 * Opaque cursor to pass as `cursor` when reversing `sortDirection`.
 * This is only populated when the page contains at least one item.
 */
backwardsCursor: string | null, };

/**
 * EXPERIMENTAL - retrieve a bounded set of persisted items from one turn.
 */
export type ThreadItemsReadParams = { threadId: string, turnId: string,
/**
 * Item IDs to retrieve. Supply 1 to 100 IDs.
 */
itemIds: Array<string>, };

/**
 * EXPERIMENTAL - persisted items returned in canonical stored order.
 */
export type ThreadItemsReadResponse = { data: Array<ThreadItemEntry>, };

export type ThreadListParams = {
/**
 * Opaque pagination cursor returned by a previous call.
 */
cursor?: string | null,
/**
 * Optional page size; defaults to a reasonable server-side value.
 */
limit?: number | null,
/**
 * Thread IDs to exclude before applying the result limit. Up to 100
 * entries; invalid IDs or a larger list are rejected, never truncated.
 * Send the same exclusions on each page. Omitted, null, or empty means no exclusions.
 */
excludedThreadIds?: Array<string> | null,
/**
 * Optional sort key; defaults to created_at.
 */
sortKey?: ThreadSortKey | null,
/**
 * Optional sort direction; defaults to descending (newest first).
 */
sortDirection?: SortDirection | null,
/**
 * Optional provider filter; when set, only sessions recorded under these
 * providers are returned. When present but empty, includes all providers.
 */
modelProviders?: Array<string> | null,
/**
 * Optional source filter; when set, only sessions from these source kinds
 * are returned. When omitted or empty, defaults to interactive sources.
 */
sourceKinds?: Array<ThreadSourceKind> | null,
/**
 * Optional originator allowlist, matching any supplied value exactly.
 * Supported by hosted backends only; the local app-server rejects a nonempty list.
 * Omitted or empty lists leave originators unrestricted.
 */
originators?: Array<string> | null,
/**
 * Optional archived filter; when set to true, only archived threads are returned.
 * If false or null, only non-archived threads are returned.
 */
archived?: boolean | null,
/**
 * Omit to include every section, set to `null` for unsectioned threads,
 * or provide a section ID to return only threads in that section.
 */
sectionId?: string | null,
/**
 * Omit to include every project, set to null for unassigned threads,
 * or provide a project ID to return only threads in that project.
 */
projectId?: string | null,
/**
 * Optional cwd filter or filters; when set, only threads whose session cwd
 * exactly matches one of these paths are returned.
 */
cwd?: string | Array<string> | null,
/**
 * If true, return from the state DB without scanning JSONL rollouts to
 * repair thread metadata. Omitted or false preserves scan-and-repair
 * behavior.
 */
useStateDbOnly?: boolean,
/**
 * Optional substring filter for the extracted thread title.
 */
searchTerm?: string | null,
/**
 * Optional direct parent thread filter. Mutually exclusive with `ancestorThreadId`.
 */
parentThreadId?: string | null,
/**
 * Optional ancestor thread filter. Returns spawned descendants at any depth, excluding the
 * ancestor itself. Mutually exclusive with `parentThreadId`.
 */
ancestorThreadId?: string | null, };

export type ThreadListResponse = { data: Array<Thread>,
/**
 * Local receipts for eligible threads on this page, keyed by thread ID.
 * Null means durable read state is unavailable; an absent key means that row is ineligible.
 */
readStates: { [key in string]?: ThreadReadState } | null,
/**
 * Opaque cursor to pass to the next call to continue after the last item.
 * if None, there are no more items to return.
 */
nextCursor: string | null,
/**
 * Opaque cursor to pass as `cursor` when reversing `sortDirection`.
 * This is only populated when the page contains at least one thread.
 * Use it with the opposite `sortDirection`; for timestamp sorts it anchors
 * at the start of the page timestamp so same-second updates are not skipped.
 */
backwardsCursor: string | null, };

export type ThreadLoadedListParams = {
/**
 * Opaque pagination cursor returned by a previous call.
 */
cursor?: string | null,
/**
 * Optional page size; defaults to no limit.
 */
limit?: number | null, };

export type ThreadLoadedListResponse = {
/**
 * Thread ids for sessions currently loaded in memory.
 */
data: Array<string>,
/**
 * Opaque cursor to pass to the next call to continue after the last item.
 * if None, there are no more items to return.
 */
nextCursor: string | null, };

export type ThreadMemoryModeSetParams = { threadId: string, mode: ThreadMemoryMode, };

export type ThreadMemoryModeSetResponse = Record<string, never>;

export type ThreadMetadataGitInfoUpdateParams = {
/**
 * Omit to leave the stored commit unchanged, set to `null` to clear it,
 * or provide a non-empty string to replace it.
 */
sha?: string | null,
/**
 * Omit to leave the stored branch unchanged, set to `null` to clear it,
 * or provide a non-empty string to replace it.
 */
branch?: string | null,
/**
 * Omit to leave the stored origin URL unchanged, set to `null` to clear it,
 * or provide a non-empty string to replace it.
 */
originUrl?: string | null, };

export type ThreadMetadataUpdateParams = { threadId: string,
/**
 * Omit to leave the project unchanged, use an empty string to clear it,
 * or provide an existing project ID to assign it.
 */
projectId?: string | null,
/**
 * Patch the stored Git metadata for this thread.
 * Omit a field to leave it unchanged, set it to `null` to clear it, or
 * provide a string to replace the stored value.
 */
gitInfo?: ThreadMetadataGitInfoUpdateParams | null,
/**
 * Save the client's Daybreak choice for this persistent thread.
 * Omitted or null leaves it unchanged. This does not select a turn's
 * `cyberAccessProgram` or grant access.
 */
daybreakEnabled?: boolean | null, };

export type ThreadMetadataUpdateResponse = { thread: Thread, };

export type ThreadNameUpdatedNotification = { threadId: string, threadName?: string, };

export type ThreadPredictionRequestParams = { threadId: string, sourceTurnId: string, };

export type ThreadPredictionRequestResponse = Record<string, never>;

export type ThreadPredictionResult = { "type": "completed", text: string | null, } | { "type": "failed" };

export type ThreadPredictionUpdatedNotification = { threadId: string, sourceTurnId: string, result: ThreadPredictionResult, };

export type ThreadProjectUpdatedNotification = { threadId: string, projectId: string | null, };

export type ThreadQueueAddParams = { threadId: string, input: Array<UserInput>, clientUserMessageId: string, };

export type ThreadQueueAddResponse = { queuedSubmission: QueuedSubmission, };

export type ThreadQueueChangedNotification = { threadId: string, };

export type ThreadQueueDeleteParams = { threadId: string, queuedSubmissionId: string, };

export type ThreadQueueDeleteResponse = { deleted: boolean, };

export type ThreadQueueListParams = { threadId: string,
/**
 * Opaque pagination cursor returned by a previous call.
 */
cursor?: string | null,
/**
 * Optional page size; defaults to the standard thread-list page size.
 */
limit?: number | null, };

export type ThreadQueueListResponse = { data: Array<QueuedSubmission>,
/**
 * Opaque cursor for the next page, or `null` when no submissions remain.
 */
nextCursor: string | null, };

export type ThreadQueueReorderParams = { threadId: string, queuedSubmissionIds: Array<string>, };

export type ThreadQueueReorderResponse = Record<string, never>;

export type ThreadQueueStartParams = { threadId: string, queuedSubmissionId?: string | null, };

export type ThreadQueueStartResponse = { turn: Turn, };

export type ThreadQueueUpdateParams = { threadId: string, queuedSubmissionId: string, input: Array<UserInput>, };

export type ThreadQueueUpdateResponse = { queuedSubmission: QueuedSubmission, };

export type ThreadReadParams = { threadId: string,
/**
 * When true, include turns and their items from rollout history.
 * Full-history hydration is deprecated for paginated threads; prefer a
 * metadata-only read and page with `thread/turns/list` and
 * `thread/items/list`.
 */
includeTurns?: boolean, };

export type ThreadReadResponse = { thread: Thread,
/**
 * Local receipt. Null means this thread's durable read state is unavailable.
 */
readState: ThreadReadState | null, };

/**
 * The first unread position in a durable local thread. A null position means read.
 * The opaque revision guards edits against activity or marks the caller has not seen.
 */
export type ThreadReadState = { firstUnread: ThreadUnreadPosition | null, revision: string, };

export type ThreadReadStateChangedNotification = { threadId: string, readState: ThreadReadState, };

export type ThreadReadStateOperation = { "type": "read" } | { "type": "unread" };

export type ThreadReadStateUpdateParams = { threadId: string, operation: ThreadReadStateOperation,
/**
 * Revision of the row or transcript actually seen. Conflicts require a fresh user action.
 */
expectedRevision: string, };

export type ThreadReadStateUpdateResponse = { readState: ThreadReadState, };

/**
 * EXPERIMENTAL - append audio input to thread realtime.
 */
export type ThreadRealtimeAppendAudioParams = { threadId: string, audio: ThreadRealtimeAudioChunk, };

/**
 * EXPERIMENTAL - response for appending realtime audio input.
 */
export type ThreadRealtimeAppendAudioResponse = Record<string, never>;

/**
 * EXPERIMENTAL - append speakable text to thread realtime.
 */
export type ThreadRealtimeAppendSpeechParams = { threadId: string, text: string, };

/**
 * EXPERIMENTAL - response for appending realtime speech.
 */
export type ThreadRealtimeAppendSpeechResponse = Record<string, never>;

/**
 * EXPERIMENTAL - append text input to thread realtime.
 */
export type ThreadRealtimeAppendTextParams = { threadId: string, text: string, role: ConversationTextRole, };

/**
 * EXPERIMENTAL - response for appending realtime text input.
 */
export type ThreadRealtimeAppendTextResponse = Record<string, never>;

/**
 * EXPERIMENTAL - thread realtime audio chunk.
 */
export type ThreadRealtimeAudioChunk = { data: string, sampleRate: number, numChannels: number, samplesPerChannel: number | null, itemId: string | null, };

/**
 * EXPERIMENTAL - how an existing agent item appears in a realtime conversation.
 */
export type ThreadRealtimeBemItemPresentation = { "type": "wholeItem" } | { "type": "inlineMarkdown" } | { "type": "inlineVisualization", index: number, };

/**
 * EXPERIMENTAL - emitted when thread realtime transport closes.
 */
export type ThreadRealtimeClosedNotification = { threadId: string, reason: string | null, };

/**
 * EXPERIMENTAL - emitted when thread realtime encounters an error.
 */
export type ThreadRealtimeErrorNotification = { threadId: string, message: string, };

/**
 * EXPERIMENTAL - role-bearing text item included when a realtime V3 session starts.
 */
export type ThreadRealtimeInitialItem = { role: ConversationTextRole, text: string, };

/**
 * EXPERIMENTAL - a thread-scoped realtime item in the canonical timeline.
 */
export type ThreadRealtimeItem = { id: string, realtimeSessionId: string, } & ({ "type": "realtimeSessionStarted" } | { "type": "transcriptSegment", role: ThreadRealtimeTranscriptRole, text: string, } | { "type": "bemItemPromoted", turnId: string, itemId: string, presentation: ThreadRealtimeBemItemPresentation, } | { "type": "realtimeSessionClosed", outcome: ThreadRealtimeSessionOutcome, });

/**
 * EXPERIMENTAL - raw non-audio thread realtime item emitted by the backend.
 */
export type ThreadRealtimeItemAddedNotification = { threadId: string, item: JsonValue, };

/**
 * EXPERIMENTAL - a realtime timeline item published after canonical commit.
 */
export type ThreadRealtimeItemCompletedNotification = { threadId: string, item: ThreadRealtimeItem, };

/**
 * EXPERIMENTAL - a realtime timeline item started before its content streams.
 */
export type ThreadRealtimeItemStartedNotification = { threadId: string, item: ThreadRealtimeItem, };

/**
 * EXPERIMENTAL - text appended to an active realtime transcript item.
 */
export type ThreadRealtimeItemTranscriptDeltaNotification = { threadId: string, itemId: string, delta: string, };

/**
 * EXPERIMENTAL - list voices supported by thread realtime.
 */
export type ThreadRealtimeListVoicesParams = Record<string, never>;

/**
 * EXPERIMENTAL - response for listing supported realtime voices.
 */
export type ThreadRealtimeListVoicesResponse = { voices: RealtimeVoicesList, };

/**
 * EXPERIMENTAL - streamed output audio emitted by thread realtime.
 */
export type ThreadRealtimeOutputAudioDeltaNotification = { threadId: string, audio: ThreadRealtimeAudioChunk, };

/**
 * EXPERIMENTAL - emitted with the remote SDP for a WebRTC realtime session.
 */
export type ThreadRealtimeSdpNotification = { threadId: string, sdp: string, };

export type ThreadRealtimeSessionOutcome = "ended" | "failed";

/**
 * EXPERIMENTAL - start a thread-scoped realtime session.
 */
export type ThreadRealtimeStartParams = { threadId: string,
/**
 * Leaves Codex response handoffs to the client's explicit append calls instead of forwarding
 * them automatically. Defaults to false.
 */
clientManagedHandoffs?: boolean | null,
/**
 * Controls whether a realtime V3 delegation produces an acknowledgement filler.
 * Omitted values preserve the Realtime API's default behavior.
 */
delegationAckFiller?: boolean | null,
/**
 * Routes any transcript tail remaining at session end through Codex. Defaults to false.
 * TODO: Remove this rollout knob once transcript-tail flushing is always enabled.
 */
flushTranscriptTailOnSessionEnd?: boolean | null,
/**
 * Sends automatic Codex responses as realtime conversation items instead of handoff appends.
 */
codexResponsesAsItems?: boolean | null,
/**
 * Optional prefix added to automatic Codex response items when `codexResponsesAsItems` is true.
 */
codexResponseItemPrefix?: string | null,
/**
 * Selects how automatic Codex responses are routed in Frameless Bidi sessions. Omitted values
 * default to `thinking`. Realtime V1 and V2 ignore this setting.
 */
codexResponseHandoffMode?: CodexResponseHandoffMode | null,
/**
 * Relays public reasoning summaries as quiet context for realtime V3 delegations. Defaults to false.
 */
backendReasoningStatus?: boolean,
/**
 * Overrides BEM channel prefixes by `analysis`, `commentary`, or `final`.
 * Omitted channels retain their default uppercase bracketed prefixes.
 */
codexResponseHandoffChannelPrefixes?: { [key in string]?: Array<string> } | null,
/**
 * Overrides the configured realtime model for this session only.
 */
model?: string | null,
/**
 * Selects text or audio output for the realtime session. Transport and voice stay
 * independent so clients can choose how they connect separately from what the model emits.
 */
outputModality: RealtimeOutputModality,
/**
 * Set to false to start without Codex's startup context. Omitted or null includes it.
 */
includeStartupContext?: boolean | null,
/**
 * Adds complete role-bearing text items to the initial Frameless Bidi session history.
 * This is only supported by realtime V3 and is sent during session startup. Requests are
 * limited to 128 items and 8,192 estimated text tokens in total.
 */
initialItems?: Array<ThreadRealtimeInitialItem> | null,
/**
 * Developer instructions given to the backing Codex model when this realtime session starts.
 */
realtimeStartInstructions?: string | null,
/**
 * Developer instructions given to the backing Codex model when this realtime session ends.
 */
realtimeEndInstructions?: string | null, prompt?: string | null | null, realtimeSessionId?: string | null,
/**
 * Client-generated identifier for the product voice session. This is distinct from
 * `realtimeSessionId`.
 */
voiceSessionId?: string | null, transport?: ThreadRealtimeStartTransport | null,
/**
 * Overrides the configured realtime protocol version for this session only.
 */
version?: RealtimeConversationVersion | null, voice?: RealtimeVoice | null, };

/**
 * EXPERIMENTAL - response for starting thread realtime.
 */
export type ThreadRealtimeStartResponse = Record<string, never>;

/**
 * EXPERIMENTAL - transport used by thread realtime.
 */
export type ThreadRealtimeStartTransport = { "type": "websocket" } | { "type": "webrtc",
/**
 * SDP offer generated by a WebRTC RTCPeerConnection after configuring audio and the
 * realtime events data channel.
 */
sdp: string, } | { "type": "existingCall",
/**
 * Identifier of a realtime call already created and negotiated by the client.
 */
callId: string, };

/**
 * EXPERIMENTAL - emitted when thread realtime startup is accepted.
 */
export type ThreadRealtimeStartedNotification = { threadId: string, realtimeSessionId: string | null, version: RealtimeConversationVersion, };

/**
 * EXPERIMENTAL - stop thread realtime.
 */
export type ThreadRealtimeStopParams = { threadId: string, };

/**
 * EXPERIMENTAL - response for stopping thread realtime.
 */
export type ThreadRealtimeStopResponse = Record<string, never>;

/**
 * EXPERIMENTAL - flat transcript delta emitted whenever realtime
 * transcript text changes.
 */
export type ThreadRealtimeTranscriptDeltaNotification = { threadId: string, role: string,
/**
 * Live transcript delta from the realtime event.
 */
delta: string, };

/**
 * EXPERIMENTAL - final transcript text emitted when realtime completes
 * a transcript part.
 */
export type ThreadRealtimeTranscriptDoneNotification = { threadId: string, role: string,
/**
 * Final complete text for the transcript part.
 */
text: string, };

export type ThreadRealtimeTranscriptRole = "user" | "assistant";

export type ThreadResumeInitialTurnsPageParams = {
/**
 * Optional turn page size.
 */
limit?: number | null,
/**
 * Optional turn pagination direction; defaults to descending.
 */
sortDirection?: SortDirection | null,
/**
 * How much item detail to include for each returned turn; defaults to summary.
 */
itemsView?: TurnItemsView | null, };

/**
 * There are three ways to resume a thread:
 * 1. By thread_id: load the thread from disk by thread_id and resume it.
 * 2. By history: instantiate the thread from memory and resume it.
 * 3. By path: load the thread from disk by path and resume it.
 *
 * For non-running threads, the precedence is: history > non-empty path > thread_id.
 * If using history or a non-empty path for a non-running thread, the thread_id
 * param will be ignored.
 *
 * If thread_id identifies a running thread, app-server rejoins that thread and
 * treats a non-empty path as a consistency check against the active rollout path.
 * Empty string path values are treated as absent.
 *
 * Prefer using thread_id whenever possible.
 */
export type ThreadResumeParams = { threadId: string,
/**
 * [UNSTABLE] FOR CODEX CLOUD - DO NOT USE.
 * If specified, the thread will be resumed with the provided history
 * instead of loaded from disk.
 */
history?: Array<ResponseItem> | null,
/**
 * [UNSTABLE] Specify the rollout path to resume from.
 * If specified for a non-running thread, the thread_id param will be ignored.
 * If thread_id identifies a running thread, the path must match the active
 * rollout path.
 */
path?: string | null,
/**
 * Configuration overrides for the resumed thread, if any.
 */
model?: string | null, modelProvider?: string | null, serviceTier?: string | null | null, cwd?: string | null,
/**
 * Replace the thread's runtime workspace roots. Paths must be absolute.
 */
runtimeWorkspaceRoots?: Array<AbsolutePathBuf> | null, approvalPolicy?: AskForApproval | null,
/**
 * Override where approval requests are routed for review on this thread
 * and subsequent turns.
 */
approvalsReviewer?: ApprovalsReviewer | null, sandbox?: SandboxMode | null,
/**
 * Named profile id for the resumed thread. Cannot be combined with
 * `sandbox`.
 */
permissions?: string | null, config?: { [key in string]?: JsonValue } | null, baseInstructions?: string | null, developerInstructions?: string | null,
/**
 * @deprecated `friendly` and `pragmatic` no longer select a style.
 * Changing this does not rewrite the thread's existing instructions.
 */
personality?: Personality | null,
/**
 * When true, return only thread metadata and live-resume state without
 * populating `thread.turns`. This is useful when the client plans to call
 * `thread/turns/list` immediately after resuming. Full-history hydration
 * is deprecated for paginated threads; use this with `thread/turns/list`
 * and `thread/items/list` instead.
 */
excludeTurns?: boolean,
/**
 * When present, include a `thread/turns/list` page in the resume response
 * so clients can bootstrap recent turns without a second request.
 */
initialTurnsPage?: ThreadResumeInitialTurnsPageParams | null, };

export type ThreadResumeResponse = { thread: Thread, model: string, modelProvider: string, serviceTier: string | null,
/**
 * Saved list of disabled plugin IDs. Does not yet filter plugin capabilities.
 */
disabledPluginIds: Array<string>, cwd: AbsolutePathBuf,
/**
 * Thread-scoped runtime workspace roots used to materialize
 * `:workspace_roots`.
 */
runtimeWorkspaceRoots: Array<AbsolutePathBuf>,
/**
 * Environment-native paths to instruction source files currently loaded for this thread.
 */
instructionSources: Array<LegacyAppPathString>, approvalPolicy: AskForApproval,
/**
 * Reviewer currently used for approval requests on this thread.
 */
approvalsReviewer: ApprovalsReviewer,
/**
 * Legacy sandbox policy retained for compatibility. Experimental clients
 * should prefer `activePermissionProfile` for profile provenance.
 */
sandbox: SandboxPolicy,
/**
 * Named or implicit built-in profile that produced the active
 * permissions, when known.
 */
activePermissionProfile: ActivePermissionProfile | null, reasoningEffort: ReasoningEffort | null,
/**
 * Effective collaboration mode. Absent when resuming from an older server.
 */
collaborationMode: CollaborationMode | null,
/**
 * @deprecated Always `explicitRequestOnly`. Use `reasoningEffort` for Ultra behavior.
 */
multiAgentMode: MultiAgentMode,
/**
 * `thread/turns/list` page returned when requested by `initialTurnsPage`.
 */
initialTurnsPage: TurnsPage | null,
/**
 * Opaque cursor for hydrating paginated turns backwards.
 *
 * Pass this as `cursor` to `thread/turns/list` with
 * `sortDirection: "desc"`. The first page includes the turn identified by the cursor.
 */
turnsBackwardsCursor: string | null,
/**
 * Opaque cursor for hydrating paginated items backwards.
 *
 * Pass this as `cursor` to `thread/items/list` with
 * `sortDirection: "desc"`. The first page includes the item identified by the cursor.
 */
itemsBackwardsCursor: string | null, };

/**
 * Replace a paginated thread's durable history with the prefix before one turn.
 *
 * This only changes persisted conversation history. It does not revert local file changes.
 */
export type ThreadRevertParams = { threadId: string,
/**
 * Turn excluded from the replacement history, together with every later turn.
 */
beforeTurnId: string, };

export type ThreadRevertResponse = {
/**
 * Updated loaded thread metadata. `turns` is always empty; hydrate retained history through
 * `thread/turns/list`.
 */
thread: Thread,
/**
 * Opaque cursor for hydrating paginated turns backwards.
 *
 * Pass this as `cursor` to `thread/turns/list` with
 * `sortDirection: "desc"`. The first page includes the turn identified by the cursor.
 */
turnsBackwardsCursor: string | null,
/**
 * Opaque cursor for hydrating paginated items backwards.
 *
 * Pass this as `cursor` to `thread/items/list` with
 * `sortDirection: "desc"`. The first page includes the item identified by the cursor.
 */
itemsBackwardsCursor: string | null, };

export type ThreadRevertedNotification = { threadId: string, };

export type ThreadSampleCancelParams = { requestId: RequestId, };

export type ThreadSampleCancelResponse = Record<string, never>;

export type ThreadSampleParams = { threadId: string,
/**
 * The loaded source's latest completed, failed, or interrupted turn.
 * Stale or active sources are rejected.
 */
expectedTurnId: string, prompt: string,
/**
 * Applied only when the provider and model support cache-preserving reasoning-effort updates.
 */
effort?: ReasoningEffort | null, turnTrigger?: string | null,
/**
 * Optional metadata to enrich Codex's ResponsesAPI turn metadata.
 */
responsesapiClientMetadata?: { [key in string]?: string } | null,
/**
 * Disable MCP servers when the inherited window uses incremental tools on Responses Lite.
 */
disableMcp?: boolean, };

export type ThreadSampleResponse = { sourceTurnId: string, responseId: string,
/**
 * Assistant text from the response, or null if it attempted a tool call or completed without text.
 */
text: string | null, inputTokens: bigint | null, cachedInputTokens: bigint | null, outputTokens: bigint | null, };

/**
 * One visible message occurrence returned by [`ThreadSearchOccurrencesResponse`].
 */
export type ThreadSearchOccurrence = { turnId: string, itemId: string, snippet: string,
/**
 * Match range within `snippet`, in UTF-16 code units.
 */
snippetMatchRange: ThreadSearchTextRange,
/**
 * Opaque inclusive cursor accepted by `thread/turns/list` for this turn.
 */
turnCursor: string, };

/**
 * Parameters for searching visible message occurrences within one paginated thread.
 */
export type ThreadSearchOccurrencesParams = { threadId: string,
/**
 * Case-insensitive literal substring to find in visible user messages and both partial and
 * final assistant answers.
 */
searchTerm: string,
/**
 * Opaque cursor returned by a previous call for the same thread and search term.
 */
cursor?: string | null,
/**
 * Optional occurrence page size.
 */
limit?: number | null, };

export type ThreadSearchOccurrencesResponse = {
/**
 * Occurrences in chronological message order.
 */
data: Array<ThreadSearchOccurrence>,
/**
 * Opaque cursor to continue after the last returned occurrence.
 */
nextCursor: string | null, };

export type ThreadSearchParams = {
/**
 * Opaque pagination cursor returned by a previous call.
 */
cursor?: string | null,
/**
 * Optional page size; defaults to a reasonable server-side value.
 */
limit?: number | null,
/**
 * Optional sort key; defaults to created_at.
 */
sortKey?: ThreadSearchSortKey | null,
/**
 * Optional sort direction; defaults to descending (newest first).
 */
sortDirection?: SortDirection | null,
/**
 * Optional source filter; when set, only sessions from these source kinds
 * are returned. When omitted or empty, defaults to interactive sources.
 */
sourceKinds?: Array<ThreadSourceKind> | null,
/**
 * Optional archived filter; when set to true, only archived threads are returned.
 * If false or null, only non-archived threads are returned.
 */
archived?: boolean | null,
/**
 * Required substring/full-text query for thread search.
 */
searchTerm: string, };

export type ThreadSearchResponse = { data: Array<ThreadSearchResult>,
/**
 * Opaque cursor to pass to the next call to continue after the last item.
 * if None, there are no more items to return.
 */
nextCursor: string | null,
/**
 * Opaque cursor to pass as `cursor` when reversing `sortDirection`.
 * This is only populated when the page contains at least one thread.
 * Use it with the opposite `sortDirection`; for timestamp sorts it anchors
 * at the start of the page timestamp so same-second updates are not skipped.
 */
backwardsCursor: string | null, };

export type ThreadSearchResult = { thread: Thread, snippet: string, };

export type ThreadSearchSortKey = "created_at" | "updated_at" | "recency_at";

/**
 * UTF-16 code-unit range within `snippet`.
 */
export type ThreadSearchTextRange = {
/**
 * Inclusive UTF-16 code-unit offset.
 */
start: number,
/**
 * Exclusive UTF-16 code-unit offset.
 */
end: number, };

/**
 * An independently persisted, user-visible thread section.
 */
export type ThreadSection = {
/**
 * Opaque UUIDv7 identity that remains stable when the section is renamed.
 */
id: string,
/**
 * The current user-visible section name.
 */
name: string,
/**
 * Optional appearance synchronized across clients.
 */
appearance: ThreadSectionAppearance | null, };

/**
 * Extensible visual presentation for a custom thread section.
 */
export type ThreadSectionAppearance = { icon: string | null, color: string | null, };

/**
 * Parameters for creating an independently persisted thread section.
 */
export type ThreadSectionCreateParams = {
/**
 * The user-visible name of the section.
 */
name: string, appearance?: ThreadSectionAppearance | null, };

/**
 * The independently persisted section created by the server.
 */
export type ThreadSectionCreateResponse = { section: ThreadSection, };

/**
 * Parameters for deleting an independently persisted thread section.
 */
export type ThreadSectionDeleteParams = {
/**
 * The stable, server-generated identity of the section to delete.
 */
sectionId: string, };

/**
 * Successful deletion does not return additional section data.
 */
export type ThreadSectionDeleteResponse = Record<string, never>;

/**
 * Parameters for listing independently persisted thread sections.
 */
export type ThreadSectionListParams = {
/**
 * Opaque pagination cursor returned by a previous call.
 */
cursor?: string | null,
/**
 * Maximum number of sections to return.
 */
limit?: number | null, };

/**
 * One page of independently persisted thread sections.
 */
export type ThreadSectionListResponse = { data: Array<ThreadSection>,
/**
 * Opaque cursor for the next page, or `null` when no sections remain.
 */
nextCursor: string | null, };

/**
 * Parameters for moving a thread within a server-owned section ordering.
 */
export type ThreadSectionMoveParams = {
/**
 * Thread to move into, within, or out of a section.
 */
threadId: string,
/**
 * Destination section, or `null` to remove the thread from its section.
 */
sectionId: string | null,
/**
 * Existing thread to insert before; omission or null appends to the section.
 */
beforeThreadId?: string | null, };

export type ThreadSectionMoveResponse = Record<string, never>;

/**
 * Parameters for updating an independently persisted thread section.
 */
export type ThreadSectionUpdateParams = {
/**
 * The stable, server-generated identity of the section to update.
 */
sectionId: string,
/**
 * The updated user-visible name of the section.
 */
name: string,
/**
 * Omit to preserve appearance, use `null` to clear it, or provide a replacement.
 */
appearance?: ThreadSectionAppearance | null, };

/**
 * The independently persisted section after its name is updated.
 */
export type ThreadSectionUpdateResponse = { section: ThreadSection, };

export type ThreadSetNameParams = { threadId: string, name: string, };

export type ThreadSetNameResponse = Record<string, never>;

export type ThreadSettings = {
/**
 * Saved list of disabled plugin IDs. Does not yet filter plugin capabilities.
 */
disabledPluginIds: Array<string>, cwd: AbsolutePathBuf, approvalPolicy: AskForApproval, approvalsReviewer: ApprovalsReviewer, sandboxPolicy: SandboxPolicy, activePermissionProfile: ActivePermissionProfile | null, model: string, modelProvider: string, serviceTier: string | null, effort: ReasoningEffort | null, summary: ReasoningSummary | null, collaborationMode: CollaborationMode,
/**
 * @deprecated Always `explicitRequestOnly`. Use `effort` for Ultra behavior.
 */
multiAgentMode: MultiAgentMode,
/**
 * @deprecated Reports the saved setting; `friendly` and `pragmatic` no longer select a style.
 */
personality: Personality | null, };

export type ThreadSettingsUpdateParams = { threadId: string,
/**
 * Replace this thread's disabled plugin IDs.
 * Omitted/null preserves the list; [] clears it.
 */
disabledPluginIds?: Array<string> | null,
/**
 * Override the working directory for subsequent turns.
 */
cwd?: string | null,
/**
 * Override the approval policy for subsequent turns.
 */
approvalPolicy?: AskForApproval | null,
/**
 * Override where approval requests are routed for subsequent turns.
 */
approvalsReviewer?: ApprovalsReviewer | null,
/**
 * Override the sandbox policy for subsequent turns.
 */
sandboxPolicy?: SandboxPolicy | null,
/**
 * Select a named permissions profile id for subsequent turns. Cannot be
 * combined with `sandboxPolicy`.
 */
permissions?: string | null,
/**
 * Override the model for subsequent turns.
 */
model?: string | null,
/**
 * Override the service tier for subsequent turns. `null` clears the
 * current service tier; omission leaves it unchanged.
 */
serviceTier?: string | null | null,
/**
 * Override the reasoning effort for subsequent turns.
 */
effort?: ReasoningEffort | null,
/**
 * Override the reasoning summary for subsequent turns.
 */
summary?: ReasoningSummary | null,
/**
 * EXPERIMENTAL - Set a pre-set collaboration mode for subsequent turns.
 *
 * For `collaboration_mode.settings.developer_instructions`, `null` means
 * "use the built-in instructions for the selected mode".
 */
collaborationMode?: CollaborationMode | null,
/**
 * @deprecated Ignored. Use `effort: "ultra"` for proactive multi-agent behavior.
 */
multiAgentMode?: MultiAgentMode | null,
/**
 * @deprecated `friendly` and `pragmatic` no longer select a style.
 * Changing this does not rewrite the thread's existing instructions.
 */
personality?: Personality | null, };

export type ThreadSettingsUpdateResponse = Record<string, never>;

export type ThreadSettingsUpdatedNotification = { threadId: string, threadSettings: ThreadSettings, };

export type ThreadShellCommandParams = { threadId: string,
/**
 * Shell command string evaluated by the thread's configured shell.
 * Unlike `command/exec`, this intentionally preserves shell syntax
 * such as pipes, redirects, and quoting. This runs unsandboxed with full
 * access rather than inheriting the thread sandbox policy.
 */
command: string,
/**
 * Maximum execution time in milliseconds. Defaults to one hour when omitted
 * or null. Must be non-negative; zero requests an immediate timeout, not
 * unlimited execution. Does not affect the immediate RPC acknowledgement.
 */
timeoutMs?: number | null, };

export type ThreadShellCommandResponse = Record<string, never>;

export type ThreadSortKey = "created_at" | "updated_at" | "recency_at" | "section_position";

export type ThreadSource = string;

export type ThreadSourceKind = "cli" | "vscode" | "exec" | "appServer" | "subAgent" | "subAgentReview" | "subAgentCompact" | "subAgentThreadSpawn" | "subAgentOther" | "unknown";

export type ThreadStartParams = { model?: string | null, modelProvider?: string | null,
/**
 * Allow a provider with an authoritative static model catalog to replace an unavailable
 * requested model with its default.
 */
allowProviderModelFallback?: boolean, serviceTier?: string | null | null, cwd?: string | null,
/**
 * Replace the thread's runtime workspace roots. Paths must be absolute.
 */
runtimeWorkspaceRoots?: Array<AbsolutePathBuf> | null, approvalPolicy?: AskForApproval | null,
/**
 * Override where approval requests are routed for review on this thread
 * and subsequent turns.
 */
approvalsReviewer?: ApprovalsReviewer | null, sandbox?: SandboxMode | null,
/**
 * Named profile id for this thread. Cannot be combined with `sandbox`.
 */
permissions?: string | null, config?: { [key in string]?: JsonValue } | null, serviceName?: string | null, baseInstructions?: string | null, developerInstructions?: string | null,
/**
 * @deprecated `friendly` and `pragmatic` no longer select a style.
 */
personality?: Personality | null,
/**
 * @deprecated Ignored. Use Ultra reasoning effort for proactive multi-agent behavior.
 */
multiAgentMode?: MultiAgentMode | null, ephemeral?: boolean | null,
/**
 * Persisted thread history contract to use for this new thread.
 */
historyMode?: ThreadHistoryMode | null, sessionStartSource?: ThreadStartSource | null,
/**
 * Optional client-supplied analytics source classification for this thread.
 */
threadSource?: ThreadSource | null,
/**
 * Optional project identity for this new thread. Durable threads persist
 * the assignment; ephemeral threads expose it only in live responses.
 */
projectId?: string | null,
/**
 * Initial Daybreak choice for this persistent thread. Omitted or null
 * leaves it unset. This does not select a turn's `cyberAccessProgram`
 * or grant access. Not supported for ephemeral threads.
 */
daybreakEnabled?: boolean | null,
/**
 * Optional sticky environments for this thread.
 *
 * Omitted selects the default environment when environment access is
 * enabled. Empty disables environment access for turns that do not
 * provide a turn override. Non-empty selects the first environment as the
 * current turn environment.
 */
environments?: Array<TurnEnvironmentParams> | null, dynamicTools?: Array<DynamicToolSpec> | null,
/**
 * Capability roots selected for this thread by the hosting platform.
 */
selectedCapabilityRoots?: Array<SelectedCapabilityRoot> | null,
/**
 * Test-only experimental field used to validate experimental gating and
 * schema filtering behavior in a stable way.
 */
mockExperimentalField?: string | null,
/**
 * If true, opt into emitting raw Responses API items on the event stream.
 * This is for internal use only (e.g. Codex Cloud).
 */
experimentalRawEvents?: boolean, };

export type ThreadStartResponse = { thread: Thread, model: string, modelProvider: string, serviceTier: string | null,
/**
 * Saved list of disabled plugin IDs. Does not yet filter plugin capabilities.
 */
disabledPluginIds: Array<string>, cwd: AbsolutePathBuf,
/**
 * Thread-scoped runtime workspace roots used to materialize
 * `:workspace_roots`.
 */
runtimeWorkspaceRoots: Array<AbsolutePathBuf>,
/**
 * Environment-native paths to instruction source files currently loaded for this thread.
 */
instructionSources: Array<LegacyAppPathString>, approvalPolicy: AskForApproval,
/**
 * Reviewer currently used for approval requests on this thread.
 */
approvalsReviewer: ApprovalsReviewer,
/**
 * Legacy sandbox policy retained for compatibility. Experimental clients
 * should prefer `activePermissionProfile` for profile provenance.
 */
sandbox: SandboxPolicy,
/**
 * Named or implicit built-in profile that produced the active
 * permissions, when known.
 */
activePermissionProfile: ActivePermissionProfile | null, reasoningEffort: ReasoningEffort | null,
/**
 * @deprecated Always `explicitRequestOnly`. Use `reasoningEffort` for Ultra behavior.
 */
multiAgentMode: MultiAgentMode, };

export type ThreadStartSource = "startup" | "clear";

export type ThreadStartedNotification = { thread: Thread, };

export type ThreadStatus = { "type": "notLoaded" } | { "type": "idle" } | { "type": "systemError" } | { "type": "active", activeFlags: Array<ThreadActiveFlag>, };

export type ThreadStatusChangedNotification = { threadId: string, status: ThreadStatus, };

/**
 * EXPERIMENTAL - one item or turn boundary in canonical rollout order.
 */
export type ThreadTimelineEntry = { "type": "item", position: number, turnId: string, item: ThreadItem, } | { "type": "realtime", position: number, item: ThreadRealtimeItem, } | { "type": "turnStarted", position: number, turnId: string, startedAt: number | null, } | { "type": "turnCompleted", position: number, turnId: string, status: TurnStatus, error: TurnError | null, startedAt: number | null, completedAt: number | null, durationMs: number | null, };

/**
 * EXPERIMENTAL - list ordinary and realtime thread history in rollout order.
 */
export type ThreadTimelineListParams = { threadId: string, cursor?: string | null, limit?: number | null, };

/**
 * EXPERIMENTAL - a bounded timeline page with its resolved opening voice state.
 */
export type ThreadTimelineListResponse = { data: Array<ThreadTimelineEntry>, nextCursor: string | null, activeRealtimeSessionAtPageStart: string | null, };

export type ThreadTokenUsage = { total: TokenUsageBreakdown, last: TokenUsageBreakdown, modelContextWindow: number | null, };

export type ThreadTokenUsageUpdatedNotification = { threadId: string, turnId: string, tokenUsage: ThreadTokenUsage, };

export type ThreadTurnsListParams = { threadId: string,
/**
 * Opaque cursor to pass to the next call to continue after the last turn.
 */
cursor?: string | null,
/**
 * Optional turn page size.
 */
limit?: number | null,
/**
 * Optional turn pagination direction; defaults to descending.
 */
sortDirection?: SortDirection | null,
/**
 * How much item detail to include for each returned turn; defaults to summary.
 */
itemsView?: TurnItemsView | null, };

export type ThreadTurnsListResponse = { data: Array<Turn>,
/**
 * Opaque cursor to pass to the next call to continue after the last turn.
 * if None, there are no more turns to return.
 */
nextCursor: string | null,
/**
 * Opaque cursor to pass as `cursor` when reversing `sortDirection`.
 * This is only populated when the page contains at least one turn.
 * Use it with the opposite `sortDirection` to include the anchor turn again
 * and catch updates to that turn.
 */
backwardsCursor: string | null, };

export type ThreadUnarchiveParams = { threadId: string, };

export type ThreadUnarchiveResponse = { thread: Thread, };

export type ThreadUnarchivedNotification = { threadId: string, };

export type ThreadUnreadPosition = { "type": "threadStart" } | { "type": "turn", turnId: string, };

export type ThreadUnsubscribeParams = { threadId: string, };

export type ThreadUnsubscribeResponse = { status: ThreadUnsubscribeStatus, };

export type ThreadUnsubscribeStatus = "notLoaded" | "notSubscribed" | "unsubscribed";

export type ThreadUsage = { threadId: string, estimatedUsageCreditsMicros: bigint, estimatedUsageUsdMicros: bigint | null, groups: Array<ThreadUsageBreakdownGroup>, };

export type ThreadUsageBreakdownGroup = { model: string | null, reasoningEffort: string | null, speed: string | null, estimatedUsageCreditsMicros: bigint, netNewInputTokens: bigint | null, cachedInputTokens: bigint | null, inputTokens: bigint | null, outputTokens: bigint | null, totalTokens: bigint | null, };

export type TokenUsageBreakdown = { totalTokens: number, inputTokens: number, cachedInputTokens: number, cacheWriteInputTokens: number, outputTokens: number, reasoningOutputTokens: number, };

/**
 * EXPERIMENTAL. Captures a user's answer to a request_user_input question.
 */
export type ToolRequestUserInputAnswer = { answers: Array<string>, };

/**
 * EXPERIMENTAL. Defines a single selectable option for request_user_input.
 */
export type ToolRequestUserInputOption = { label: string, description: string, };

/**
 * EXPERIMENTAL. Params sent with a request_user_input event.
 */
export type ToolRequestUserInputParams = { threadId: string, turnId: string, itemId: string, questions: Array<ToolRequestUserInputQuestion>, isBlocking: boolean,
/**
 * @deprecated Use `isBlocking` to decide whether the request should block.
 */
autoResolutionMs: number | null, };

/**
 * EXPERIMENTAL. Represents one request_user_input question and its required options.
 */
export type ToolRequestUserInputQuestion = { id: string, header: string, question: string, isOther: boolean, isSecret: boolean, options: Array<ToolRequestUserInputOption> | null, };

/**
 * EXPERIMENTAL. Response payload mapping question ids to answers.
 */
export type ToolRequestUserInputResponse = { answers: { [key in string]?: ToolRequestUserInputAnswer }, };

export type ToolsV2 = { web_search: WebSearchToolConfig | null, };

export type Turn = {
/**
 * Identifier for this turn. Codex-generated turn IDs are UUIDv7.
 */
id: string,
/**
 * ID of the first turn in the chain of work that led to this turn.
 * Pass this as `rootTurnId` when starting work on behalf of this turn.
 * May be null in older history or a `review/start` response.
 */
rootTurnId: string | null,
/**
 * Thread items currently included in this turn payload.
 */
items: Array<ThreadItem>,
/**
 * Describes how much of `items` has been loaded for this turn.
 */
itemsView: TurnItemsView, status: TurnStatus,
/**
 * Error associated with a failed or interrupted turn.
 */
error: TurnError | null,
/**
 * Unix timestamp (in seconds) when the turn started.
 */
startedAt: number | null,
/**
 * Unix timestamp (in seconds) when the turn completed.
 */
completedAt: number | null,
/**
 * Duration between turn start and completion in milliseconds, if known.
 */
durationMs: number | null, };

export type TurnCompletedNotification = { threadId: string, turn: Turn, };

/**
 * Notification that the turn-level unified diff has changed.
 * Contains the latest aggregated diff across all file changes in the turn.
 */
export type TurnDiffUpdatedNotification = { threadId: string, turnId: string, diff: string, };

export type TurnEnvironmentParams = { environmentId: string, cwd: LegacyAppPathString,
/**
 * Environment-native runtime workspace roots. Omitted defaults to `cwd`.
 */
runtimeWorkspaceRoots?: Array<LegacyAppPathString> | null, };

export type TurnError = { message: string, codexErrorInfo: CodexErrorInfo | null, additionalDetails: string | null,
/**
 * Optional public explanation and continuation instruction for a misalignment block.
 */
misalignment: MisalignmentErrorDetails | null, };

export type TurnInterruptParams = { threadId: string, turnId: string, };

export type TurnInterruptResponse = Record<string, never>;

export type TurnItemsView = "notLoaded" | "summary" | "full";

export type TurnModerationMetadataNotification = { threadId: string, turnId: string, metadata: JsonValue, };

export type TurnPlanStep = { step: string, status: TurnPlanStepStatus, };

export type TurnPlanStepStatus = "pending" | "inProgress" | "completed";

export type TurnPlanUpdatedNotification = { threadId: string, turnId: string, explanation: string | null, plan: Array<TurnPlanStep>, };

/**
 * Experimental settings changes for one running turn, not future turns.
 * Unsupported fields are rejected rather than silently ignored.
 * Any live task kind may accept publication. Child sessions and consumers of
 * frozen initial settings are unchanged.
 */
export type TurnSettingsUpdateParams = { threadId: string, turnId: string,
/**
 * Changes the active turn's reviewer without changing future thread settings.
 * Already captured steps and pending approvals retain their original reviewer.
 */
approvalsReviewer?: ApprovalsReviewer | null,
/**
 * Omission or `null` leaves the model unchanged.
 */
model?: string | null,
/**
 * Omission or `null` leaves the effort unchanged.
 */
effort?: ReasoningEffort | null,
/**
 * Omission or `null` leaves the summary preference unchanged.
 */
summary?: ReasoningSummary | null,
/**
 * `null` clears the requested tier; omission leaves it unchanged.
 */
serviceTier?: string | null | null, };

export type TurnSettingsUpdateResponse = { status: TurnSettingsUpdateStatus, };

export type TurnSettingsUpdateStatus = "applied" | "targetUnavailable";

export type TurnStartParams = { threadId: string,
/**
 * Replace this thread's disabled plugin IDs.
 * Omitted/null preserves the list; [] clears it.
 */
disabledPluginIds?: Array<string> | null, clientUserMessageId?: string | null, input: Array<UserInput>,
/**
 * Optional source classification for the caller that starts this turn.
 * Ignored when this request steers an already-active turn.
 */
turnTrigger?: string | null,
/**
 * ID of the turn that caused this new turn to start.
 *
 * Set this when starting work on behalf of another turn, such as delegated
 * work in a different thread. Leave unset for work started directly by the
 * user. Ignored when this request adds input to an active turn.
 */
parentTurnId?: string | null,
/**
 * ID of the first turn in the chain of work that led to this new turn.
 *
 * When setting `parentTurnId`, set this to the parent turn's `rootTurnId`
 * when known. This keeps descendant work attributed to the original turn.
 * If omitted, the new turn becomes its own root. Ignored when this request
 * adds input to an active turn.
 */
rootTurnId?: string | null, toolOutput?: TurnToolOutput | null,
/**
 * Optional metadata to enrich Codex's ResponsesAPI turn metadata.
 * Replaces unprotected client-provided entries when supplied; an empty map clears them.
 *
 * Entries are flattened into the JSON string sent as
 * `client_metadata["x-codex-turn-metadata"]` on ResponsesAPI HTTP and websocket requests.
 *
 * They are not sent as top-level ResponsesAPI `client_metadata` keys, and reserved keys
 * such as `session_id`, `thread_id`, `turn_id`, and `window_id` cannot be overridden.
 */
responsesapiClientMetadata?: { [key in string]?: string } | null,
/**
 * Merge entries into the ResponsesAPI turn metadata without removing existing entries.
 * Applied after `responsesapiClientMetadata` if both are provided; reserved keys remain protected.
 */
responsesapiClientMetadataPatch?: { [key in string]?: string } | null,
/**
 * Optional client-provided context fragments keyed by an opaque source identifier.
 */
additionalContext?: { [key in string]?: AdditionalContextEntry } | null,
/**
 * Optional environments for this turn and subsequent turns.
 *
 * Omitted uses the thread sticky environments. Empty disables
 * environment access for this turn. Non-empty selects the first
 * environment as the current turn environment for this turn.
 */
environments?: Array<TurnEnvironmentParams> | null,
/**
 * Override the working directory for this turn and subsequent turns.
 */
cwd?: string | null,
/**
 * Replace the thread's runtime workspace roots for this turn and
 * subsequent turns. Paths must be absolute.
 */
runtimeWorkspaceRoots?: Array<AbsolutePathBuf> | null,
/**
 * Override the approval policy for this turn and subsequent turns.
 */
approvalPolicy?: AskForApproval | null,
/**
 * Override where approval requests are routed for review on this turn and
 * subsequent turns.
 */
approvalsReviewer?: ApprovalsReviewer | null,
/**
 * Override the sandbox policy for this turn and subsequent turns.
 */
sandboxPolicy?: SandboxPolicy | null,
/**
 * Select a named permissions profile id for this turn and subsequent
 * turns. Cannot be combined with `sandboxPolicy`.
 */
permissions?: string | null,
/**
 * Override the model for this turn and subsequent turns.
 */
model?: string | null,
/**
 * Override the service tier for this turn and subsequent turns.
 */
serviceTier?: string | null | null,
/**
 * Override the service tier only when this request starts a new turn.
 * Use "default" for standard speed. Omitted or null inherits the thread's tier.
 * Does not change the thread's tier or a turn being steered.
 */
serviceTierForTurn?: string | null,
/**
 * Override the reasoning effort for this turn and subsequent turns.
 */
effort?: ReasoningEffort | null,
/**
 * Override the reasoning summary for this turn and subsequent turns.
 */
summary?: ReasoningSummary | null,
/**
 * @deprecated `friendly` and `pragmatic` no longer select a style.
 * Changing this does not rewrite the thread's existing instructions.
 */
personality?: Personality | null,
/**
 * Optional JSON Schema used to constrain the final assistant message for
 * this turn.
 */
outputSchema?: JsonValue | null,
/**
 * EXPERIMENTAL - Set a pre-set collaboration mode.
 * Takes precedence over model, reasoning_effort, and developer instructions if set.
 *
 * For `collaboration_mode.settings.developer_instructions`, `null` means
 * "use the built-in instructions for the selected mode".
 */
collaborationMode?: CollaborationMode | null,
/**
 * @deprecated Ignored. Use `effort: "ultra"` for proactive multi-agent behavior.
 */
multiAgentMode?: MultiAgentMode | null,
/**
 * EXPERIMENTAL - Request an authorized cyber program for this
 * turn. Omission preserves automatic behavior. This does not grant access.
 */
cyberAccessProgram?: CyberAccessProgram | null, };

export type TurnStartResponse = { turn: Turn, };

export type TurnStartedNotification = { threadId: string, turn: Turn, };

export type TurnStatus = "completed" | "interrupted" | "failed" | "inProgress";

export type TurnSteerParams = { threadId: string, clientUserMessageId?: string | null, input: Array<UserInput>,
/**
 * Optional metadata to enrich Codex's ResponsesAPI turn metadata.
 * Replaces unprotected client-provided entries when supplied; an empty map clears them.
 *
 * Entries are flattened into the JSON string sent as
 * `client_metadata["x-codex-turn-metadata"]` on ResponsesAPI HTTP and websocket requests.
 *
 * They are not sent as top-level ResponsesAPI `client_metadata` keys, and reserved keys
 * such as `session_id`, `thread_id`, `turn_id`, and `window_id` cannot be overridden.
 */
responsesapiClientMetadata?: { [key in string]?: string } | null,
/**
 * Merge entries into the ResponsesAPI turn metadata without removing existing entries.
 * Applied after `responsesapiClientMetadata` if both are provided; reserved keys remain protected.
 */
responsesapiClientMetadataPatch?: { [key in string]?: string } | null,
/**
 * Optional client-provided context fragments keyed by an opaque source identifier.
 */
additionalContext?: { [key in string]?: AdditionalContextEntry } | null,
/**
 * Required active turn id precondition. The request fails when it does not
 * match the currently active turn.
 */
expectedTurnId: string, };

export type TurnSteerResponse = { turnId: string, };

export type TurnToolOutput = { name: string, namespace: string | null, output: FunctionCallOutputBody,
/**
 * Requests retention of this output in the thread's model history.
 */
retain?: boolean, };

export type TurnsPage = { data: Array<Turn>, nextCursor: string | null, backwardsCursor: string | null, };

export type UserInput = { "type": "text", text: string,
/**
 * UI-defined spans within `text` used to render or persist special elements.
 */
text_elements: Array<TextElement>, } | { "type": "image", detail?: ImageDetail, } & ({ url: string, } | { fileId: string, }) | { "type": "localImage", detail?: ImageDetail, path: string, } | { "type": "audio", url: string, } | { "type": "localAudio", path: string, } | { "type": "skill", name: string, path: string, } | { "type": "mention", name: string, path: string, };

/**
 * Cancels a native verification RPC issued on this connection, not an elicitation.
 * Use a fresh request ID for each operation and a distinct ID for this cancellation RPC.
 */
export type UserVerificationCancelParams = { requestId: RequestId, };

/**
 * Acknowledges the cancellation signal; native work may still be finishing.
 * Unknown or finished requests are a no-op, and completed effects are not rolled back.
 */
export type UserVerificationCancelResponse = Record<string, never>;

export type UserVerificationCancellationReason = "userCancelled" | "interrupted";

export type UserVerificationDeleteParams = Record<string, never>;

export type UserVerificationDeleteResponse = Record<string, never>;

export type UserVerificationEnrollParams = Record<string, never>;

/**
 * Public metadata for a created or reused local credential. The caller completes
 * backend registration; this response does not establish server enrollment.
 * Older app-servers omit the metadata fields; callers must check both before registration.
 */
export type UserVerificationEnrollResponse = { credentialId: string, algorithm: string | null,
/**
 * Unpadded base64url of the SubjectPublicKeyInfo DER encoding.
 */
publicKey: string | null, };

/**
 * Closed error categories; native diagnostic payloads must not cross this boundary.
 */
export type UserVerificationErrorDetails = { "type": "invalidRequest", reason: UserVerificationInvalidRequestReason, } | { "type": "unavailable", reason: UserVerificationUnavailableReason, } | { "type": "cancelled", reason: UserVerificationCancellationReason, } | { "type": "failed", reason: UserVerificationFailureReason, };

export type UserVerificationFailureReason = "authenticationFailed" | "timeout" | "providerError" | "serviceError";

export type UserVerificationInvalidRequestReason = "invalidParams";

/**
 * A signature over the exact decoded challenge. The verifier validates and consumes it.
 */
export type UserVerificationProof = { credentialId: string,
/**
 * Unpadded base64url DER ECDSA signature using P-256 and SHA-256.
 */
signature: string, };

/**
 * The error object inside the normal JSON-RPC envelope.
 */
export type UserVerificationRpcError = { code: number, message: string, data: UserVerificationErrorDetails, };

export type UserVerificationStatusParams = Record<string, never>;

/**
 * Local readiness only; this neither prompts nor queries server registration.
 */
export type UserVerificationStatusResponse = { credentialId: string | null, unavailableReason: UserVerificationUnavailableReason | null, unavailableMessage: string | null, };

export type UserVerificationUnavailableReason = "credentialMissing" | "biometricsUnavailable" | "providerUnavailable";

/**
 * Local signing primitive, independent of any pending elicitation.
 */
export type UserVerificationVerifyParams = {
/**
 * Unpadded base64url encoding of 1–4096 challenge bytes.
 */
challenge: string,
/**
 * Display context already approved by the UI; 1–256 UTF-8 bytes.
 */
title: string,
/**
 * Additional display context; at most 4096 UTF-8 bytes.
 */
description: string, };

export type UserVerificationVerifyResponse = { proof: UserVerificationProof, };

export type WarningNotification = {
/**
 * Optional thread target when the warning applies to a specific thread.
 */
threadId: string | null,
/**
 * Concise warning message for the user.
 */
message: string, };

export type WebSearchAction = { "type": "search", query: string | null, queries: Array<string> | null, } | { "type": "openPage", url: string | null, } | { "type": "findInPage", url: string | null, pattern: string | null, } | { "type": "other" };

export type WindowsSandboxImplementation = "elevated" | "unelevated" | "mxc";

export type WindowsSandboxReadiness = "ready" | "notConfigured" | "updateRequired";

export type WindowsSandboxReadinessResponse = { status: WindowsSandboxReadiness, };

export type WindowsSandboxSetupCompletedNotification = { mode: WindowsSandboxSetupMode, success: boolean, error: string | null, };

export type WindowsSandboxSetupMode = "elevated" | "unelevated";

export type WindowsSandboxSetupStartParams = { mode: WindowsSandboxSetupMode, cwd?: AbsolutePathBuf | null, };

export type WindowsSandboxSetupStartResponse = { started: boolean, };

export type WindowsWorldWritableWarningNotification = { samplePaths: Array<string>, extraCount: number, failedScan: boolean, };

export type WorkspaceMessage = { messageId: string, messageType: WorkspaceMessageType, messageBody: string,
/**
 * Unix timestamp (in seconds) when the message was created.
 */
createdAt: number | null,
/**
 * Unix timestamp (in seconds) when the message was archived.
 */
archivedAt: number | null, };

export type WorkspaceMessageType = "headline" | "announcement" | "unknown";

export type WorkspaceRouting = { chatgptAccountId: string, backendOrigin: string, accountRoutingOverride: AccountRoutingOverride, };

export type WriteStatus = "ok" | "okOverridden";

export type JsonValue = number | string | boolean | Array<JsonValue> | { [key in string]?: JsonValue } | null;

export type ClientRequests = {
  readonly 'initialize': { readonly params: InitializeParams; readonly result: InitializeResponse };
  readonly 'server/diagnostics': { readonly params: ServerDiagnosticsParams; readonly result: ServerDiagnosticsResponse };
  readonly 'userVerification/status': { readonly params: UserVerificationStatusParams; readonly result: UserVerificationStatusResponse };
  readonly 'userVerification/enroll': { readonly params: UserVerificationEnrollParams; readonly result: UserVerificationEnrollResponse };
  readonly 'userVerification/delete': { readonly params: UserVerificationDeleteParams; readonly result: UserVerificationDeleteResponse };
  readonly 'userVerification/verify': { readonly params: UserVerificationVerifyParams; readonly result: UserVerificationVerifyResponse };
  readonly 'userVerification/cancel': { readonly params: UserVerificationCancelParams; readonly result: UserVerificationCancelResponse };
  readonly 'thread/start': { readonly params: ThreadStartParams; readonly result: ThreadStartResponse };
  readonly 'thread/resume': { readonly params: ThreadResumeParams; readonly result: ThreadResumeResponse };
  readonly 'thread/fork': { readonly params: ThreadForkParams; readonly result: ThreadForkResponse };
  readonly 'thread/sample': { readonly params: ThreadSampleParams; readonly result: ThreadSampleResponse };
  readonly 'thread/sample/cancel': { readonly params: ThreadSampleCancelParams; readonly result: ThreadSampleCancelResponse };
  readonly 'thread/archive': { readonly params: ThreadArchiveParams; readonly result: ThreadArchiveResponse };
  readonly 'thread/delete': { readonly params: ThreadDeleteParams; readonly result: ThreadDeleteResponse };
  readonly 'thread/unsubscribe': { readonly params: ThreadUnsubscribeParams; readonly result: ThreadUnsubscribeResponse };
  readonly 'thread/increment_elicitation': { readonly params: ThreadIncrementElicitationParams; readonly result: ThreadIncrementElicitationResponse };
  readonly 'thread/decrement_elicitation': { readonly params: ThreadDecrementElicitationParams; readonly result: ThreadDecrementElicitationResponse };
  readonly 'thread/name/set': { readonly params: ThreadSetNameParams; readonly result: ThreadSetNameResponse };
  readonly 'thread/prediction/request': { readonly params: ThreadPredictionRequestParams; readonly result: ThreadPredictionRequestResponse };
  readonly 'thread/goal/set': { readonly params: ThreadGoalSetParams; readonly result: ThreadGoalSetResponse };
  readonly 'thread/goal/get': { readonly params: ThreadGoalGetParams; readonly result: ThreadGoalGetResponse };
  readonly 'thread/goal/clear': { readonly params: ThreadGoalClearParams; readonly result: ThreadGoalClearResponse };
  readonly 'thread/queue/add': { readonly params: ThreadQueueAddParams; readonly result: ThreadQueueAddResponse };
  readonly 'thread/queue/list': { readonly params: ThreadQueueListParams; readonly result: ThreadQueueListResponse };
  readonly 'thread/queue/update': { readonly params: ThreadQueueUpdateParams; readonly result: ThreadQueueUpdateResponse };
  readonly 'thread/queue/delete': { readonly params: ThreadQueueDeleteParams; readonly result: ThreadQueueDeleteResponse };
  readonly 'thread/queue/reorder': { readonly params: ThreadQueueReorderParams; readonly result: ThreadQueueReorderResponse };
  readonly 'thread/queue/start': { readonly params: ThreadQueueStartParams; readonly result: ThreadQueueStartResponse };
  readonly 'thread/metadata/update': { readonly params: ThreadMetadataUpdateParams; readonly result: ThreadMetadataUpdateResponse };
  readonly 'thread/attachment/add': { readonly params: ThreadAttachmentAddParams; readonly result: ThreadAttachmentAddResponse };
  readonly 'thread/attachment/list': { readonly params: ThreadAttachmentListParams; readonly result: ThreadAttachmentListResponse };
  readonly 'thread/attachmentOwner/list': { readonly params: ThreadAttachmentOwnerListParams; readonly result: ThreadAttachmentOwnerListResponse };
  readonly 'thread/attachment/remove': { readonly params: ThreadAttachmentRemoveParams; readonly result: ThreadAttachmentRemoveResponse };
  readonly 'thread/section/move': { readonly params: ThreadSectionMoveParams; readonly result: ThreadSectionMoveResponse };
  readonly 'thread/settings/update': { readonly params: ThreadSettingsUpdateParams; readonly result: ThreadSettingsUpdateResponse };
  readonly 'thread/memoryMode/set': { readonly params: ThreadMemoryModeSetParams; readonly result: ThreadMemoryModeSetResponse };
  readonly 'memory/status': { readonly params: MemoryStatusParams; readonly result: MemoryStatusResponse };
  readonly 'memory/reset': { readonly params: undefined; readonly result: MemoryResetResponse };
  readonly 'rollout/compress': { readonly params: undefined; readonly result: RolloutCompressResponse };
  readonly 'thread/unarchive': { readonly params: ThreadUnarchiveParams; readonly result: ThreadUnarchiveResponse };
  readonly 'thread/compact/start': { readonly params: ThreadCompactStartParams; readonly result: ThreadCompactStartResponse };
  readonly 'thread/shellCommand': { readonly params: ThreadShellCommandParams; readonly result: ThreadShellCommandResponse };
  readonly 'thread/approveGuardianDeniedAction': { readonly params: ThreadApproveGuardianDeniedActionParams; readonly result: ThreadApproveGuardianDeniedActionResponse };
  readonly 'thread/backgroundTerminals/clean': { readonly params: ThreadBackgroundTerminalsCleanParams; readonly result: ThreadBackgroundTerminalsCleanResponse };
  readonly 'thread/backgroundTerminals/list': { readonly params: ThreadBackgroundTerminalsListParams; readonly result: ThreadBackgroundTerminalsListResponse };
  readonly 'thread/backgroundTerminals/terminate': { readonly params: ThreadBackgroundTerminalsTerminateParams; readonly result: ThreadBackgroundTerminalsTerminateResponse };
  readonly 'thread/revert': { readonly params: ThreadRevertParams; readonly result: ThreadRevertResponse };
  readonly 'thread/list': { readonly params: ThreadListParams; readonly result: ThreadListResponse };
  readonly 'project/list': { readonly params: ProjectListParams; readonly result: ProjectListResponse };
  readonly 'project/read': { readonly params: ProjectReadParams; readonly result: ProjectReadResponse };
  readonly 'project/create': { readonly params: ProjectCreateParams; readonly result: ProjectCreateResponse };
  readonly 'project/import': { readonly params: ProjectImportParams; readonly result: ProjectImportResponse };
  readonly 'project/update': { readonly params: ProjectUpdateParams; readonly result: ProjectUpdateResponse };
  readonly 'project/move': { readonly params: ProjectMoveParams; readonly result: ProjectMoveResponse };
  readonly 'project/delete': { readonly params: ProjectDeleteParams; readonly result: ProjectDeleteResponse };
  readonly 'threadSection/list': { readonly params: ThreadSectionListParams; readonly result: ThreadSectionListResponse };
  readonly 'threadSection/create': { readonly params: ThreadSectionCreateParams; readonly result: ThreadSectionCreateResponse };
  readonly 'threadSection/update': { readonly params: ThreadSectionUpdateParams; readonly result: ThreadSectionUpdateResponse };
  readonly 'threadSection/delete': { readonly params: ThreadSectionDeleteParams; readonly result: ThreadSectionDeleteResponse };
  readonly 'thread/search': { readonly params: ThreadSearchParams; readonly result: ThreadSearchResponse };
  readonly 'thread/searchOccurrences': { readonly params: ThreadSearchOccurrencesParams; readonly result: ThreadSearchOccurrencesResponse };
  readonly 'thread/loaded/list': { readonly params: ThreadLoadedListParams; readonly result: ThreadLoadedListResponse };
  readonly 'thread/read': { readonly params: ThreadReadParams; readonly result: ThreadReadResponse };
  readonly 'thread/readState/update': { readonly params: ThreadReadStateUpdateParams; readonly result: ThreadReadStateUpdateResponse };
  readonly 'thread/turns/list': { readonly params: ThreadTurnsListParams; readonly result: ThreadTurnsListResponse };
  readonly 'thread/items/list': { readonly params: ThreadItemsListParams; readonly result: ThreadItemsListResponse };
  readonly 'thread/items/read': { readonly params: ThreadItemsReadParams; readonly result: ThreadItemsReadResponse };
  readonly 'thread/inject_items': { readonly params: ThreadInjectItemsParams; readonly result: ThreadInjectItemsResponse };
  readonly 'skills/list': { readonly params: SkillsListParams; readonly result: SkillsListResponse };
  readonly 'skills/extraRoots/set': { readonly params: SkillsExtraRootsSetParams; readonly result: SkillsExtraRootsSetResponse };
  readonly 'hooks/list': { readonly params: HooksListParams; readonly result: HooksListResponse };
  readonly 'marketplace/add': { readonly params: MarketplaceAddParams; readonly result: MarketplaceAddResponse };
  readonly 'marketplace/remove': { readonly params: MarketplaceRemoveParams; readonly result: MarketplaceRemoveResponse };
  readonly 'marketplace/upgrade': { readonly params: MarketplaceUpgradeParams; readonly result: MarketplaceUpgradeResponse };
  readonly 'plugin/list': { readonly params: PluginListParams; readonly result: PluginListResponse };
  readonly 'plugin/search': { readonly params: PluginSearchParams; readonly result: PluginSearchResponse };
  readonly 'plugin/installed': { readonly params: PluginInstalledParams; readonly result: PluginInstalledResponse };
  readonly 'plugin/reconcile': { readonly params: PluginReconcileParams; readonly result: PluginReconcileResponse };
  readonly 'plugin/read': { readonly params: PluginReadParams; readonly result: PluginReadResponse };
  readonly 'plugin/skill/read': { readonly params: PluginSkillReadParams; readonly result: PluginSkillReadResponse };
  readonly 'plugin/share/save': { readonly params: PluginShareSaveParams; readonly result: PluginShareSaveResponse };
  readonly 'plugin/share/updateTargets': { readonly params: PluginShareUpdateTargetsParams; readonly result: PluginShareUpdateTargetsResponse };
  readonly 'plugin/share/list': { readonly params: PluginShareListParams; readonly result: PluginShareListResponse };
  readonly 'plugin/share/checkout': { readonly params: PluginShareCheckoutParams; readonly result: PluginShareCheckoutResponse };
  readonly 'plugin/share/delete': { readonly params: PluginShareDeleteParams; readonly result: PluginShareDeleteResponse };
  readonly 'app/read': { readonly params: AppsReadParams; readonly result: AppsReadResponse };
  readonly 'app/list': { readonly params: AppsListParams; readonly result: AppsListResponse };
  readonly 'app/installed': { readonly params: AppsInstalledParams; readonly result: AppsInstalledResponse };
  readonly 'fs/readFile': { readonly params: FsReadFileParams; readonly result: FsReadFileResponse };
  readonly 'fs/writeFile': { readonly params: FsWriteFileParams; readonly result: FsWriteFileResponse };
  readonly 'fs/createDirectory': { readonly params: FsCreateDirectoryParams; readonly result: FsCreateDirectoryResponse };
  readonly 'fs/getMetadata': { readonly params: FsGetMetadataParams; readonly result: FsGetMetadataResponse };
  readonly 'fs/readDirectory': { readonly params: FsReadDirectoryParams; readonly result: FsReadDirectoryResponse };
  readonly 'fs/remove': { readonly params: FsRemoveParams; readonly result: FsRemoveResponse };
  readonly 'fs/copy': { readonly params: FsCopyParams; readonly result: FsCopyResponse };
  readonly 'fs/watch': { readonly params: FsWatchParams; readonly result: FsWatchResponse };
  readonly 'fs/unwatch': { readonly params: FsUnwatchParams; readonly result: FsUnwatchResponse };
  readonly 'skills/config/write': { readonly params: SkillsConfigWriteParams; readonly result: SkillsConfigWriteResponse };
  readonly 'plugin/install': { readonly params: PluginInstallParams; readonly result: PluginInstallResponse };
  readonly 'plugin/uninstall': { readonly params: PluginUninstallParams; readonly result: PluginUninstallResponse };
  readonly 'turn/start': { readonly params: TurnStartParams; readonly result: TurnStartResponse };
  readonly 'turn/settings/update': { readonly params: TurnSettingsUpdateParams; readonly result: TurnSettingsUpdateResponse };
  readonly 'turn/steer': { readonly params: TurnSteerParams; readonly result: TurnSteerResponse };
  readonly 'turn/interrupt': { readonly params: TurnInterruptParams; readonly result: TurnInterruptResponse };
  readonly 'thread/realtime/start': { readonly params: ThreadRealtimeStartParams; readonly result: ThreadRealtimeStartResponse };
  readonly 'thread/realtime/appendAudio': { readonly params: ThreadRealtimeAppendAudioParams; readonly result: ThreadRealtimeAppendAudioResponse };
  readonly 'thread/realtime/appendText': { readonly params: ThreadRealtimeAppendTextParams; readonly result: ThreadRealtimeAppendTextResponse };
  readonly 'thread/realtime/appendSpeech': { readonly params: ThreadRealtimeAppendSpeechParams; readonly result: ThreadRealtimeAppendSpeechResponse };
  readonly 'thread/realtime/stop': { readonly params: ThreadRealtimeStopParams; readonly result: ThreadRealtimeStopResponse };
  readonly 'thread/timeline/list': { readonly params: ThreadTimelineListParams; readonly result: ThreadTimelineListResponse };
  readonly 'thread/realtime/listVoices': { readonly params: ThreadRealtimeListVoicesParams; readonly result: ThreadRealtimeListVoicesResponse };
  readonly 'review/start': { readonly params: ReviewStartParams; readonly result: ReviewStartResponse };
  readonly 'model/list': { readonly params: ModelListParams; readonly result: ModelListResponse };
  readonly 'account/gatewayOAuth/read': { readonly params: undefined; readonly result: GatewayOAuthReadResponse };
  readonly 'account/gatewayOAuth/login': { readonly params: undefined; readonly result: GatewayOAuthLoginResponse };
  readonly 'account/gatewayOAuth/cancel': { readonly params: undefined; readonly result: GatewayOAuthCancelResponse };
  readonly 'modelProvider/capabilities/read': { readonly params: ModelProviderCapabilitiesReadParams; readonly result: ModelProviderCapabilitiesReadResponse };
  readonly 'experimentalFeature/list': { readonly params: ExperimentalFeatureListParams; readonly result: ExperimentalFeatureListResponse };
  readonly 'permissionProfile/list': { readonly params: PermissionProfileListParams; readonly result: PermissionProfileListResponse };
  readonly 'experimentalFeature/enablement/set': { readonly params: ExperimentalFeatureEnablementSetParams; readonly result: ExperimentalFeatureEnablementSetResponse };
  readonly 'remoteControl/enable': { readonly params: RemoteControlEnableParams | null; readonly result: RemoteControlEnableResponse };
  readonly 'remoteControl/disable': { readonly params: RemoteControlDisableParams | null; readonly result: RemoteControlDisableResponse };
  readonly 'remoteControl/status/read': { readonly params: undefined; readonly result: RemoteControlStatusReadResponse };
  readonly 'remoteControl/pairing/start': { readonly params: RemoteControlPairingStartParams; readonly result: RemoteControlPairingStartResponse };
  readonly 'remoteControl/pairing/status': { readonly params: RemoteControlPairingStatusParams; readonly result: RemoteControlPairingStatusResponse };
  readonly 'remoteControl/client/list': { readonly params: RemoteControlClientsListParams; readonly result: RemoteControlClientsListResponse };
  readonly 'remoteControl/client/revoke': { readonly params: RemoteControlClientsRevokeParams; readonly result: RemoteControlClientsRevokeResponse };
  readonly 'collaborationMode/list': { readonly params: CollaborationModeListParams; readonly result: CollaborationModeListResponse };
  readonly 'mock/experimentalMethod': { readonly params: MockExperimentalMethodParams; readonly result: MockExperimentalMethodResponse };
  readonly 'environment/add': { readonly params: EnvironmentAddParams; readonly result: EnvironmentAddResponse };
  readonly 'environment/info': { readonly params: EnvironmentInfoParams; readonly result: EnvironmentInfoResponse };
  readonly 'environment/status': { readonly params: EnvironmentStatusParams; readonly result: EnvironmentStatusResponse };
  readonly 'mcpServer/oauth/login': { readonly params: McpServerOauthLoginParams; readonly result: McpServerOauthLoginResponse };
  readonly 'config/mcpServer/reload': { readonly params: undefined; readonly result: McpServerRefreshResponse };
  readonly 'mcpServerStatus/list': { readonly params: ListMcpServerStatusParams; readonly result: ListMcpServerStatusResponse };
  readonly 'mcpServer/resource/read': { readonly params: McpResourceReadParams; readonly result: McpResourceReadResponse };
  readonly 'mcpServer/event/stream/start': { readonly params: McpServerEventStreamStartParams; readonly result: McpServerEventStreamStartResponse };
  readonly 'mcpServer/event/stream/stop': { readonly params: McpServerEventStreamStopParams; readonly result: McpServerEventStreamStopResponse };
  readonly 'mcpServer/tool/call': { readonly params: McpServerToolCallParams; readonly result: McpServerToolCallResponse };
  readonly 'windowsSandbox/setupStart': { readonly params: WindowsSandboxSetupStartParams; readonly result: WindowsSandboxSetupStartResponse };
  readonly 'windowsSandbox/readiness': { readonly params: undefined; readonly result: WindowsSandboxReadinessResponse };
  readonly 'account/login/start': { readonly params: LoginAccountParams; readonly result: LoginAccountResponse };
  readonly 'account/bedrock/discover': { readonly params: BedrockDiscoverParams; readonly result: BedrockDiscoverResponse };
  readonly 'account/bedrock/setup': { readonly params: BedrockSetupParams; readonly result: BedrockSetupResponse };
  readonly 'account/bedrock/checkGovCloudRequirements': { readonly params: BedrockCheckGovCloudRequirementsParams; readonly result: BedrockCheckGovCloudRequirementsResponse };
  readonly 'account/login/cancel': { readonly params: CancelLoginAccountParams; readonly result: CancelLoginAccountResponse };
  readonly 'account/logout': { readonly params: undefined; readonly result: LogoutAccountResponse };
  readonly 'account/rateLimits/read': { readonly params: GetAccountRateLimitsParams | undefined; readonly result: GetAccountRateLimitsResponse };
  readonly 'account/rateLimitResetCredit/consume': { readonly params: ConsumeAccountRateLimitResetCreditParams; readonly result: ConsumeAccountRateLimitResetCreditResponse };
  readonly 'account/usage/read': { readonly params: GetAccountTokenUsageParams | undefined; readonly result: GetAccountTokenUsageResponse };
  readonly 'account/workspaceMessages/read': { readonly params: undefined; readonly result: GetWorkspaceMessagesResponse };
  readonly 'account/sendAddCreditsNudgeEmail': { readonly params: SendAddCreditsNudgeEmailParams; readonly result: SendAddCreditsNudgeEmailResponse };
  readonly 'feedback/upload': { readonly params: FeedbackUploadParams; readonly result: FeedbackUploadResponse };
  readonly 'feedback/save': { readonly params: FeedbackSaveParams; readonly result: FeedbackSaveResponse };
  readonly 'command/exec': { readonly params: CommandExecParams; readonly result: CommandExecResponse };
  readonly 'command/exec/write': { readonly params: CommandExecWriteParams; readonly result: CommandExecWriteResponse };
  readonly 'command/exec/terminate': { readonly params: CommandExecTerminateParams; readonly result: CommandExecTerminateResponse };
  readonly 'command/exec/resize': { readonly params: CommandExecResizeParams; readonly result: CommandExecResizeResponse };
  readonly 'process/spawn': { readonly params: ProcessSpawnParams; readonly result: ProcessSpawnResponse };
  readonly 'process/writeStdin': { readonly params: ProcessWriteStdinParams; readonly result: ProcessWriteStdinResponse };
  readonly 'process/kill': { readonly params: ProcessKillParams; readonly result: ProcessKillResponse };
  readonly 'process/resizePty': { readonly params: ProcessResizePtyParams; readonly result: ProcessResizePtyResponse };
  readonly 'config/read': { readonly params: ConfigReadParams; readonly result: ConfigReadResponse };
  readonly 'externalAgentConfig/detect': { readonly params: ExternalAgentConfigDetectParams; readonly result: ExternalAgentConfigDetectResponse };
  readonly 'externalAgentConfig/import': { readonly params: ExternalAgentConfigImportParams; readonly result: ExternalAgentConfigImportResponse };
  readonly 'externalAgentConfig/import/recordHistory': { readonly params: ExternalAgentConfigImportHistoryRecordParams; readonly result: ExternalAgentConfigImportHistoryRecordResponse };
  readonly 'externalAgentConfig/import/readHistories': { readonly params: undefined; readonly result: ExternalAgentConfigImportHistoriesReadResponse };
  readonly 'config/value/write': { readonly params: ConfigValueWriteParams; readonly result: ConfigWriteResponse };
  readonly 'config/batchWrite': { readonly params: ConfigBatchWriteParams; readonly result: ConfigWriteResponse };
  readonly 'configRequirements/read': { readonly params: undefined; readonly result: ConfigRequirementsReadResponse };
  readonly 'account/read': { readonly params: GetAccountParams; readonly result: GetAccountResponse };
  readonly 'getConversationSummary': { readonly params: GetConversationSummaryParams; readonly result: GetConversationSummaryResponse };
  readonly 'gitDiffToRemote': { readonly params: GitDiffToRemoteParams; readonly result: GitDiffToRemoteResponse };
  readonly 'getAuthStatus': { readonly params: GetAuthStatusParams; readonly result: GetAuthStatusResponse };
  readonly 'fuzzyFileSearch': { readonly params: FuzzyFileSearchParams; readonly result: FuzzyFileSearchResponse };
  readonly 'fuzzyFileSearch/sessionStart': { readonly params: FuzzyFileSearchSessionStartParams; readonly result: FuzzyFileSearchSessionStartResponse };
  readonly 'fuzzyFileSearch/sessionUpdate': { readonly params: FuzzyFileSearchSessionUpdateParams; readonly result: FuzzyFileSearchSessionUpdateResponse };
  readonly 'fuzzyFileSearch/sessionStop': { readonly params: FuzzyFileSearchSessionStopParams; readonly result: FuzzyFileSearchSessionStopResponse };
};

export type ServerRequests = {
  readonly 'item/commandExecution/requestApproval': { readonly params: CommandExecutionRequestApprovalParams; readonly result: CommandExecutionRequestApprovalResponse };
  readonly 'item/fileChange/requestApproval': { readonly params: FileChangeRequestApprovalParams; readonly result: FileChangeRequestApprovalResponse };
  readonly 'item/tool/requestUserInput': { readonly params: ToolRequestUserInputParams; readonly result: ToolRequestUserInputResponse };
  readonly 'mcpServer/elicitation/request': { readonly params: McpServerElicitationRequestParams; readonly result: McpServerElicitationRequestResponse };
  readonly 'item/permissions/requestApproval': { readonly params: PermissionsRequestApprovalParams; readonly result: PermissionsRequestApprovalResponse };
  readonly 'item/tool/call': { readonly params: DynamicToolCallParams; readonly result: DynamicToolCallResponse };
  readonly 'account/chatgptAuthTokens/refresh': { readonly params: ChatgptAuthTokensRefreshParams; readonly result: ChatgptAuthTokensRefreshResponse };
  readonly 'attestation/generate': { readonly params: AttestationGenerateParams; readonly result: AttestationGenerateResponse };
  readonly 'currentTime/read': { readonly params: CurrentTimeReadParams; readonly result: CurrentTimeReadResponse };
  readonly 'applyPatchApproval': { readonly params: ApplyPatchApprovalParams; readonly result: ApplyPatchApprovalResponse };
  readonly 'execCommandApproval': { readonly params: ExecCommandApprovalParams; readonly result: ExecCommandApprovalResponse };
};

