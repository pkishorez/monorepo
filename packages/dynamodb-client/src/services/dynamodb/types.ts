import type { Effect, Data as EffectData } from "effect";
import type { CommonAwsError } from "../../error.js";
import { AWSServiceClient } from "../../client.js";

export declare class DynamoDB extends AWSServiceClient {
  batchExecuteStatement(
    input: BatchExecuteStatementInput,
  ): Effect.Effect<
    BatchExecuteStatementOutput,
    InternalServerError | RequestLimitExceeded | ThrottlingException | CommonAwsError
  >;
  batchGetItem(
    input: BatchGetItemInput,
  ): Effect.Effect<
    BatchGetItemOutput,
    InternalServerError | InvalidEndpointException | ProvisionedThroughputExceededException | RequestLimitExceeded | ResourceNotFoundException | ThrottlingException | CommonAwsError
  >;
  batchWriteItem(
    input: BatchWriteItemInput,
  ): Effect.Effect<
    BatchWriteItemOutput,
    InternalServerError | InvalidEndpointException | ItemCollectionSizeLimitExceededException | ProvisionedThroughputExceededException | ReplicatedWriteConflictException | RequestLimitExceeded | ResourceNotFoundException | ThrottlingException | CommonAwsError
  >;
  createBackup(
    input: CreateBackupInput,
  ): Effect.Effect<
    CreateBackupOutput,
    BackupInUseException | ContinuousBackupsUnavailableException | InternalServerError | InvalidEndpointException | LimitExceededException | TableInUseException | TableNotFoundException | CommonAwsError
  >;
  createGlobalTable(
    input: CreateGlobalTableInput,
  ): Effect.Effect<
    CreateGlobalTableOutput,
    GlobalTableAlreadyExistsException | InternalServerError | InvalidEndpointException | LimitExceededException | TableNotFoundException | CommonAwsError
  >;
  createTable(
    input: CreateTableInput,
  ): Effect.Effect<
    CreateTableOutput,
    InternalServerError | InvalidEndpointException | LimitExceededException | ResourceInUseException | CommonAwsError
  >;
  deleteBackup(
    input: DeleteBackupInput,
  ): Effect.Effect<
    DeleteBackupOutput,
    BackupInUseException | BackupNotFoundException | InternalServerError | InvalidEndpointException | LimitExceededException | CommonAwsError
  >;
  deleteItem(
    input: DeleteItemInput,
  ): Effect.Effect<
    DeleteItemOutput,
    ConditionalCheckFailedException | InternalServerError | InvalidEndpointException | ItemCollectionSizeLimitExceededException | ProvisionedThroughputExceededException | ReplicatedWriteConflictException | RequestLimitExceeded | ResourceNotFoundException | ThrottlingException | TransactionConflictException | CommonAwsError
  >;
  deleteResourcePolicy(
    input: DeleteResourcePolicyInput,
  ): Effect.Effect<
    DeleteResourcePolicyOutput,
    InternalServerError | InvalidEndpointException | LimitExceededException | PolicyNotFoundException | ResourceInUseException | ResourceNotFoundException | CommonAwsError
  >;
  deleteTable(
    input: DeleteTableInput,
  ): Effect.Effect<
    DeleteTableOutput,
    InternalServerError | InvalidEndpointException | LimitExceededException | ResourceInUseException | ResourceNotFoundException | CommonAwsError
  >;
  describeBackup(
    input: DescribeBackupInput,
  ): Effect.Effect<
    DescribeBackupOutput,
    BackupNotFoundException | InternalServerError | InvalidEndpointException | CommonAwsError
  >;
  describeContinuousBackups(
    input: DescribeContinuousBackupsInput,
  ): Effect.Effect<
    DescribeContinuousBackupsOutput,
    InternalServerError | InvalidEndpointException | TableNotFoundException | CommonAwsError
  >;
  describeContributorInsights(
    input: DescribeContributorInsightsInput,
  ): Effect.Effect<
    DescribeContributorInsightsOutput,
    InternalServerError | ResourceNotFoundException | CommonAwsError
  >;
  describeEndpoints(
    input: DescribeEndpointsRequest,
  ): Effect.Effect<
    DescribeEndpointsResponse,
    CommonAwsError
  >;
  describeExport(
    input: DescribeExportInput,
  ): Effect.Effect<
    DescribeExportOutput,
    ExportNotFoundException | InternalServerError | LimitExceededException | CommonAwsError
  >;
  describeGlobalTable(
    input: DescribeGlobalTableInput,
  ): Effect.Effect<
    DescribeGlobalTableOutput,
    GlobalTableNotFoundException | InternalServerError | InvalidEndpointException | CommonAwsError
  >;
  describeGlobalTableSettings(
    input: DescribeGlobalTableSettingsInput,
  ): Effect.Effect<
    DescribeGlobalTableSettingsOutput,
    GlobalTableNotFoundException | InternalServerError | InvalidEndpointException | CommonAwsError
  >;
  describeImport(
    input: DescribeImportInput,
  ): Effect.Effect<
    DescribeImportOutput,
    ImportNotFoundException | CommonAwsError
  >;
  describeKinesisStreamingDestination(
    input: DescribeKinesisStreamingDestinationInput,
  ): Effect.Effect<
    DescribeKinesisStreamingDestinationOutput,
    InternalServerError | InvalidEndpointException | ResourceNotFoundException | CommonAwsError
  >;
  describeLimits(
    input: DescribeLimitsInput,
  ): Effect.Effect<
    DescribeLimitsOutput,
    InternalServerError | InvalidEndpointException | CommonAwsError
  >;
  describeTable(
    input: DescribeTableInput,
  ): Effect.Effect<
    DescribeTableOutput,
    InternalServerError | InvalidEndpointException | ResourceNotFoundException | CommonAwsError
  >;
  describeTableReplicaAutoScaling(
    input: DescribeTableReplicaAutoScalingInput,
  ): Effect.Effect<
    DescribeTableReplicaAutoScalingOutput,
    InternalServerError | ResourceNotFoundException | CommonAwsError
  >;
  describeTimeToLive(
    input: DescribeTimeToLiveInput,
  ): Effect.Effect<
    DescribeTimeToLiveOutput,
    InternalServerError | InvalidEndpointException | ResourceNotFoundException | CommonAwsError
  >;
  disableKinesisStreamingDestination(
    input: KinesisStreamingDestinationInput,
  ): Effect.Effect<
    KinesisStreamingDestinationOutput,
    InternalServerError | InvalidEndpointException | LimitExceededException | ResourceInUseException | ResourceNotFoundException | CommonAwsError
  >;
  enableKinesisStreamingDestination(
    input: KinesisStreamingDestinationInput,
  ): Effect.Effect<
    KinesisStreamingDestinationOutput,
    InternalServerError | InvalidEndpointException | LimitExceededException | ResourceInUseException | ResourceNotFoundException | CommonAwsError
  >;
  executeStatement(
    input: ExecuteStatementInput,
  ): Effect.Effect<
    ExecuteStatementOutput,
    ConditionalCheckFailedException | DuplicateItemException | InternalServerError | ItemCollectionSizeLimitExceededException | ProvisionedThroughputExceededException | RequestLimitExceeded | ResourceNotFoundException | ThrottlingException | TransactionConflictException | CommonAwsError
  >;
  executeTransaction(
    input: ExecuteTransactionInput,
  ): Effect.Effect<
    ExecuteTransactionOutput,
    IdempotentParameterMismatchException | InternalServerError | ProvisionedThroughputExceededException | RequestLimitExceeded | ResourceNotFoundException | ThrottlingException | TransactionCanceledException | TransactionInProgressException | CommonAwsError
  >;
  exportTableToPointInTime(
    input: ExportTableToPointInTimeInput,
  ): Effect.Effect<
    ExportTableToPointInTimeOutput,
    ExportConflictException | InternalServerError | InvalidExportTimeException | LimitExceededException | PointInTimeRecoveryUnavailableException | TableNotFoundException | CommonAwsError
  >;
  getItem(
    input: GetItemInput,
  ): Effect.Effect<
    GetItemOutput,
    InternalServerError | InvalidEndpointException | ProvisionedThroughputExceededException | RequestLimitExceeded | ResourceNotFoundException | ThrottlingException | CommonAwsError
  >;
  getResourcePolicy(
    input: GetResourcePolicyInput,
  ): Effect.Effect<
    GetResourcePolicyOutput,
    InternalServerError | InvalidEndpointException | PolicyNotFoundException | ResourceNotFoundException | CommonAwsError
  >;
  importTable(
    input: ImportTableInput,
  ): Effect.Effect<
    ImportTableOutput,
    ImportConflictException | LimitExceededException | ResourceInUseException | CommonAwsError
  >;
  listBackups(
    input: ListBackupsInput,
  ): Effect.Effect<
    ListBackupsOutput,
    InternalServerError | InvalidEndpointException | CommonAwsError
  >;
  listContributorInsights(
    input: ListContributorInsightsInput,
  ): Effect.Effect<
    ListContributorInsightsOutput,
    InternalServerError | ResourceNotFoundException | CommonAwsError
  >;
  listExports(
    input: ListExportsInput,
  ): Effect.Effect<
    ListExportsOutput,
    InternalServerError | LimitExceededException | CommonAwsError
  >;
  listGlobalTables(
    input: ListGlobalTablesInput,
  ): Effect.Effect<
    ListGlobalTablesOutput,
    InternalServerError | InvalidEndpointException | CommonAwsError
  >;
  listImports(
    input: ListImportsInput,
  ): Effect.Effect<
    ListImportsOutput,
    LimitExceededException | CommonAwsError
  >;
  listTables(
    input: ListTablesInput,
  ): Effect.Effect<
    ListTablesOutput,
    InternalServerError | InvalidEndpointException | CommonAwsError
  >;
  listTagsOfResource(
    input: ListTagsOfResourceInput,
  ): Effect.Effect<
    ListTagsOfResourceOutput,
    InternalServerError | InvalidEndpointException | ResourceNotFoundException | CommonAwsError
  >;
  putItem(
    input: PutItemInput,
  ): Effect.Effect<
    PutItemOutput,
    ConditionalCheckFailedException | InternalServerError | InvalidEndpointException | ItemCollectionSizeLimitExceededException | ProvisionedThroughputExceededException | ReplicatedWriteConflictException | RequestLimitExceeded | ResourceNotFoundException | ThrottlingException | TransactionConflictException | CommonAwsError
  >;
  putResourcePolicy(
    input: PutResourcePolicyInput,
  ): Effect.Effect<
    PutResourcePolicyOutput,
    InternalServerError | InvalidEndpointException | LimitExceededException | PolicyNotFoundException | ResourceInUseException | ResourceNotFoundException | CommonAwsError
  >;
  query(
    input: QueryInput,
  ): Effect.Effect<
    QueryOutput,
    InternalServerError | InvalidEndpointException | ProvisionedThroughputExceededException | RequestLimitExceeded | ResourceNotFoundException | ThrottlingException | CommonAwsError
  >;
  restoreTableFromBackup(
    input: RestoreTableFromBackupInput,
  ): Effect.Effect<
    RestoreTableFromBackupOutput,
    BackupInUseException | BackupNotFoundException | InternalServerError | InvalidEndpointException | LimitExceededException | TableAlreadyExistsException | TableInUseException | CommonAwsError
  >;
  restoreTableToPointInTime(
    input: RestoreTableToPointInTimeInput,
  ): Effect.Effect<
    RestoreTableToPointInTimeOutput,
    InternalServerError | InvalidEndpointException | InvalidRestoreTimeException | LimitExceededException | PointInTimeRecoveryUnavailableException | TableAlreadyExistsException | TableInUseException | TableNotFoundException | CommonAwsError
  >;
  scan(
    input: ScanInput,
  ): Effect.Effect<
    ScanOutput,
    InternalServerError | InvalidEndpointException | ProvisionedThroughputExceededException | RequestLimitExceeded | ResourceNotFoundException | ThrottlingException | CommonAwsError
  >;
  tagResource(
    input: TagResourceInput,
  ): Effect.Effect<
    {},
    InternalServerError | InvalidEndpointException | LimitExceededException | ResourceInUseException | ResourceNotFoundException | CommonAwsError
  >;
  transactGetItems(
    input: TransactGetItemsInput,
  ): Effect.Effect<
    TransactGetItemsOutput,
    InternalServerError | InvalidEndpointException | ProvisionedThroughputExceededException | RequestLimitExceeded | ResourceNotFoundException | ThrottlingException | TransactionCanceledException | CommonAwsError
  >;
  transactWriteItems(
    input: TransactWriteItemsInput,
  ): Effect.Effect<
    TransactWriteItemsOutput,
    IdempotentParameterMismatchException | InternalServerError | InvalidEndpointException | ProvisionedThroughputExceededException | RequestLimitExceeded | ResourceNotFoundException | ThrottlingException | TransactionCanceledException | TransactionInProgressException | CommonAwsError
  >;
  untagResource(
    input: UntagResourceInput,
  ): Effect.Effect<
    {},
    InternalServerError | InvalidEndpointException | LimitExceededException | ResourceInUseException | ResourceNotFoundException | CommonAwsError
  >;
  updateContinuousBackups(
    input: UpdateContinuousBackupsInput,
  ): Effect.Effect<
    UpdateContinuousBackupsOutput,
    ContinuousBackupsUnavailableException | InternalServerError | InvalidEndpointException | TableNotFoundException | CommonAwsError
  >;
  updateContributorInsights(
    input: UpdateContributorInsightsInput,
  ): Effect.Effect<
    UpdateContributorInsightsOutput,
    InternalServerError | ResourceNotFoundException | CommonAwsError
  >;
  updateGlobalTable(
    input: UpdateGlobalTableInput,
  ): Effect.Effect<
    UpdateGlobalTableOutput,
    GlobalTableNotFoundException | InternalServerError | InvalidEndpointException | ReplicaAlreadyExistsException | ReplicaNotFoundException | TableNotFoundException | CommonAwsError
  >;
  updateGlobalTableSettings(
    input: UpdateGlobalTableSettingsInput,
  ): Effect.Effect<
    UpdateGlobalTableSettingsOutput,
    GlobalTableNotFoundException | IndexNotFoundException | InternalServerError | InvalidEndpointException | LimitExceededException | ReplicaNotFoundException | ResourceInUseException | CommonAwsError
  >;
  updateItem(
    input: UpdateItemInput,
  ): Effect.Effect<
    UpdateItemOutput,
    ConditionalCheckFailedException | InternalServerError | InvalidEndpointException | ItemCollectionSizeLimitExceededException | ProvisionedThroughputExceededException | ReplicatedWriteConflictException | RequestLimitExceeded | ResourceNotFoundException | ThrottlingException | TransactionConflictException | CommonAwsError
  >;
  updateKinesisStreamingDestination(
    input: UpdateKinesisStreamingDestinationInput,
  ): Effect.Effect<
    UpdateKinesisStreamingDestinationOutput,
    InternalServerError | InvalidEndpointException | LimitExceededException | ResourceInUseException | ResourceNotFoundException | CommonAwsError
  >;
  updateTable(
    input: UpdateTableInput,
  ): Effect.Effect<
    UpdateTableOutput,
    InternalServerError | InvalidEndpointException | LimitExceededException | ResourceInUseException | ResourceNotFoundException | CommonAwsError
  >;
  updateTableReplicaAutoScaling(
    input: UpdateTableReplicaAutoScalingInput,
  ): Effect.Effect<
    UpdateTableReplicaAutoScalingOutput,
    InternalServerError | LimitExceededException | ResourceInUseException | ResourceNotFoundException | CommonAwsError
  >;
  updateTimeToLive(
    input: UpdateTimeToLiveInput,
  ): Effect.Effect<
    UpdateTimeToLiveOutput,
    InternalServerError | InvalidEndpointException | LimitExceededException | ResourceInUseException | ResourceNotFoundException | CommonAwsError
  >;
}

export type ApproximateCreationDateTimePrecision = "MILLISECOND" | "MICROSECOND";
export type ArchivalReason = string;
/**
 * Contains details of a table archival operation.
 */
export interface ArchivalSummary {
  /**
  * The date and time when table archival was initiated by DynamoDB, in UNIX epoch time
  * format.
  */
  ArchivalDateTime?: Date | string;
  /**
  * The reason DynamoDB archived the table. Currently, the only possible value is:
  * INACCESSIBLE_ENCRYPTION_CREDENTIALS - The table was archived due
  * to the table's KMS key being inaccessible for more than seven
  * days. An On-Demand backup was created at the archival time.
  */
  ArchivalReason?: string;
  /**
  * The Amazon Resource Name (ARN) of the backup the table was archived to, when
  * applicable in the archival reason. If you wish to restore this backup to the same table
  * name, you will need to delete the original table.
  */
  ArchivalBackupArn?: string;
}
export type AttributeAction = "ADD" | "PUT" | "DELETE";
/**
 * Represents an attribute for describing the schema for the table and indexes.
 */
export interface AttributeDefinition {
  /**
  * A name for the attribute.
  */
  AttributeName: string;
  /**
  * The data type for the attribute, where:
  * S - the attribute is of type String
  * N - the attribute is of type Number
  * B - the attribute is of type Binary
  */
  AttributeType: ScalarAttributeType;
}
export type AttributeDefinitions = Array<AttributeDefinition>;
export type AttributeMap = Record<string, AttributeValue>
export type AttributeName = string;
export type AttributeNameList = Array<string>;
export type AttributeUpdates = Record<string, AttributeValueUpdate>
/**
 * Represents the data for an attribute.
 * Each attribute value is described as a name-value pair. The name is the data type, and
 * the value is the data itself.
 * For more information, see Data Types in the Amazon DynamoDB Developer
 * Guide.
 */
interface _AttributeValue {
  /**
  * An attribute of type String. For example:
  * "S": "Hello"
  */
  S?: string;
  /**
  * An attribute of type Number. For example:
  * "N": "123.45"
  * Numbers are sent across the network to DynamoDB as strings, to maximize compatibility
  * across languages and libraries. However, DynamoDB treats them as number type attributes
  * for mathematical operations.
  */
  N?: string;
  /**
  * An attribute of type Binary. For example:
  * "B": "dGhpcyB0ZXh0IGlzIGJhc2U2NC1lbmNvZGVk"
  */
  B?: Uint8Array | string;
  /**
  * An attribute of type String Set. For example:
  * "SS": ["Giraffe", "Hippo" ,"Zebra"]
  */
  SS?: Array<string>;
  /**
  * An attribute of type Number Set. For example:
  * "NS": ["42.2", "-19", "7.5", "3.14"]
  * Numbers are sent across the network to DynamoDB as strings, to maximize compatibility
  * across languages and libraries. However, DynamoDB treats them as number type attributes
  * for mathematical operations.
  */
  NS?: Array<string>;
  /**
  * An attribute of type Binary Set. For example:
  * "BS": ["U3Vubnk=", "UmFpbnk=", "U25vd3k="]
  */
  BS?: Array<Uint8Array | string>;
  /**
  * An attribute of type Map. For example:
  * "M": {"Name": {"S": "Joe"}, "Age": {"N": "35"}}
  */
  M?: Record<string, AttributeValue>;
  /**
  * An attribute of type List. For example:
  * "L": [ {"S": "Cookies"} , {"S": "Coffee"}, {"N": "3.14159"}]
  */
  L?: Array<AttributeValue>;
  /**
  * An attribute of type Null. For example:
  * "NULL": true
  */
  NULL?: boolean;
  /**
  * An attribute of type Boolean. For example:
  * "BOOL": true
  */
  BOOL?: boolean;
}

export type AttributeValue = (_AttributeValue & { S: string }) | (_AttributeValue & { N: string }) | (_AttributeValue & { B: Uint8Array | string }) | (_AttributeValue & { SS: Array<string> }) | (_AttributeValue & { NS: Array<string> }) | (_AttributeValue & { BS: Array<Uint8Array | string> }) | (_AttributeValue & { M: Record<string, AttributeValue> }) | (_AttributeValue & { L: Array<AttributeValue> }) | (_AttributeValue & { NULL: boolean }) | (_AttributeValue & { BOOL: boolean });
export type AttributeValueList = Array<AttributeValue>;
/**
 * For the UpdateItem operation, represents the attributes to be modified,
 * the action to perform on each, and the new value for each.
 * You cannot use UpdateItem to update any primary key attributes.
 * Instead, you will need to delete the item, and then use PutItem to
 * create a new item with new attributes.
 * Attribute values cannot be null; string and binary type attributes must have lengths
 * greater than zero; and set type attributes must not be empty. Requests with empty values
 * will be rejected with a ValidationException exception.
 */
export interface AttributeValueUpdate {
  /**
  * Represents the data for an attribute.
  * Each attribute value is described as a name-value pair. The name is the data type, and
  * the value is the data itself.
  * For more information, see Data Types in the Amazon DynamoDB Developer Guide.
  */
  Value?: AttributeValue;
  /**
  * Specifies how to perform the update. Valid values are PUT (default),
  * DELETE, and ADD. The behavior depends on whether the
  * specified primary key already exists in the table.
  * If an item with the specified Key is found in
  * the table:
  * PUT - Adds the specified attribute to the item. If the attribute
  * already exists, it is replaced by the new value. 
  * DELETE - If no value is specified, the attribute and its value are
  * removed from the item. The data type of the specified value must match the
  * existing value's data type.
  * If a set of values is specified, then those values are
  * subtracted from the old set. For example, if the attribute value was the set
  * [a,b,c] and the DELETE action specified
  * [a,c], then the final attribute value would be
  * [b]. Specifying an empty set is an error.
  * ADD - If the attribute does not already exist, then the attribute
  * and its values are added to the item. If the attribute does exist, then the
  * behavior of ADD depends on the data type of the attribute:
  * If the existing attribute is a number, and if Value is
  * also a number, then the Value is mathematically added to
  * the existing attribute. If Value is a negative number, then
  * it is subtracted from the existing attribute.
  * If you use ADD to increment or decrement a number
  * value for an item that doesn't exist before the update, DynamoDB
  * uses 0 as the initial value.
  * In addition, if you use ADD to update an existing
  * item, and intend to increment or decrement an attribute value which
  * does not yet exist, DynamoDB uses 0 as the initial
  * value. For example, suppose that the item you want to update does
  * not yet have an attribute named itemcount, but
  * you decide to ADD the number 3 to this
  * attribute anyway, even though it currently does not exist. DynamoDB
  * will create the itemcount attribute, set its
  * initial value to 0, and finally add 3 to
  * it. The result will be a new itemcount
  * attribute in the item, with a value of 3.
  * If the existing data type is a set, and if the Value is
  * also a set, then the Value is added to the existing set.
  * (This is a set operation, not mathematical
  * addition.) For example, if the attribute value was the set
  * [1,2], and the ADD action specified
  * [3], then the final attribute value would be
  * [1,2,3]. An error occurs if an Add action is specified
  * for a set attribute and the attribute type specified does not match the
  * existing set type. 
  * Both sets must have the same primitive data type. For example, if the
  * existing data type is a set of strings, the Value must also
  * be a set of strings. The same holds true for number sets and binary
  * sets.
  * This action is only valid for an existing attribute whose data type is number
  * or is a set. Do not use ADD for any other data types.
  * If no item with the specified Key is
  * found:
  * PUT - DynamoDB creates a new item with the specified primary key,
  * and then adds the attribute. 
  * DELETE - Nothing happens; there is no attribute to delete.
  * ADD - DynamoDB creates a new item with the supplied primary key and
  * number (or set) for the attribute value. The only data types allowed are number,
  * number set, string set or binary set.
  */
  Action?: AttributeAction;
}
/**
 * Represents the properties of the scaling policy.
 */
export interface AutoScalingPolicyDescription {
  /**
  * The name of the scaling policy.
  */
  PolicyName?: string;
  /**
  * Represents a target tracking scaling policy configuration.
  */
  TargetTrackingScalingPolicyConfiguration?: AutoScalingTargetTrackingScalingPolicyConfigurationDescription;
}
export type AutoScalingPolicyDescriptionList = Array<AutoScalingPolicyDescription>;
export type AutoScalingPolicyName = string;
/**
 * Represents the auto scaling policy to be modified.
 */
export interface AutoScalingPolicyUpdate {
  /**
  * The name of the scaling policy.
  */
  PolicyName?: string;
  /**
  * Represents a target tracking scaling policy configuration.
  */
  TargetTrackingScalingPolicyConfiguration: AutoScalingTargetTrackingScalingPolicyConfigurationUpdate;
}
export type AutoScalingRoleArn = string;
/**
 * Represents the auto scaling settings for a global table or global secondary
 * index.
 */
export interface AutoScalingSettingsDescription {
  /**
  * The minimum capacity units that a global table or global secondary index should be
  * scaled down to.
  */
  MinimumUnits?: number;
  /**
  * The maximum capacity units that a global table or global secondary index should be
  * scaled up to.
  */
  MaximumUnits?: number;
  /**
  * Disabled auto scaling for this global table or global secondary index.
  */
  AutoScalingDisabled?: boolean;
  /**
  * Role ARN used for configuring the auto scaling policy.
  */
  AutoScalingRoleArn?: string;
  /**
  * Information about the scaling policies.
  */
  ScalingPolicies?: Array<AutoScalingPolicyDescription>;
}
/**
 * Represents the auto scaling settings to be modified for a global table or global
 * secondary index.
 */
export interface AutoScalingSettingsUpdate {
  /**
  * The minimum capacity units that a global table or global secondary index should be
  * scaled down to.
  */
  MinimumUnits?: number;
  /**
  * The maximum capacity units that a global table or global secondary index should be
  * scaled up to.
  */
  MaximumUnits?: number;
  /**
  * Disabled auto scaling for this global table or global secondary index.
  */
  AutoScalingDisabled?: boolean;
  /**
  * Role ARN used for configuring auto scaling policy.
  */
  AutoScalingRoleArn?: string;
  /**
  * The scaling policy to apply for scaling target global table or global secondary index
  * capacity units.
  */
  ScalingPolicyUpdate?: AutoScalingPolicyUpdate;
}
/**
 * Represents the properties of a target tracking scaling policy.
 */
export interface AutoScalingTargetTrackingScalingPolicyConfigurationDescription {
  /**
  * Indicates whether scale in by the target tracking policy is disabled. If the value is
  * true, scale in is disabled and the target tracking policy won't remove capacity from the
  * scalable resource. Otherwise, scale in is enabled and the target tracking policy can
  * remove capacity from the scalable resource. The default value is false.
  */
  DisableScaleIn?: boolean;
  /**
  * The amount of time, in seconds, after a scale in activity completes before another
  * scale in activity can start. The cooldown period is used to block subsequent scale in
  * requests until it has expired. You should scale in conservatively to protect your
  * application's availability. However, if another alarm triggers a scale out policy during
  * the cooldown period after a scale-in, application auto scaling scales out your scalable
  * target immediately.
  */
  ScaleInCooldown?: number;
  /**
  * The amount of time, in seconds, after a scale out activity completes before another
  * scale out activity can start. While the cooldown period is in effect, the capacity that
  * has been added by the previous scale out event that initiated the cooldown is calculated
  * as part of the desired capacity for the next scale out. You should continuously (but not
  * excessively) scale out.
  */
  ScaleOutCooldown?: number;
  /**
  * The target value for the metric. The range is 8.515920e-109 to 1.174271e+108 (Base 10)
  * or 2e-360 to 2e360 (Base 2).
  */
  TargetValue: number;
}
/**
 * Represents the settings of a target tracking scaling policy that will be
 * modified.
 */
export interface AutoScalingTargetTrackingScalingPolicyConfigurationUpdate {
  /**
  * Indicates whether scale in by the target tracking policy is disabled. If the value is
  * true, scale in is disabled and the target tracking policy won't remove capacity from the
  * scalable resource. Otherwise, scale in is enabled and the target tracking policy can
  * remove capacity from the scalable resource. The default value is false.
  */
  DisableScaleIn?: boolean;
  /**
  * The amount of time, in seconds, after a scale in activity completes before another
  * scale in activity can start. The cooldown period is used to block subsequent scale in
  * requests until it has expired. You should scale in conservatively to protect your
  * application's availability. However, if another alarm triggers a scale out policy during
  * the cooldown period after a scale-in, application auto scaling scales out your scalable
  * target immediately.
  */
  ScaleInCooldown?: number;
  /**
  * The amount of time, in seconds, after a scale out activity completes before another
  * scale out activity can start. While the cooldown period is in effect, the capacity that
  * has been added by the previous scale out event that initiated the cooldown is calculated
  * as part of the desired capacity for the next scale out. You should continuously (but not
  * excessively) scale out.
  */
  ScaleOutCooldown?: number;
  /**
  * The target value for the metric. The range is 8.515920e-109 to 1.174271e+108 (Base 10)
  * or 2e-360 to 2e360 (Base 2).
  */
  TargetValue: number;
}
export type AvailabilityErrorMessage = string;
export type Backfilling = boolean;
export type BackupArn = string;
export type BackupCreationDateTime = Date | string;
/**
 * Contains the description of the backup created for the table.
 */
export interface BackupDescription {
  /**
  * Contains the details of the backup created for the table.
  */
  BackupDetails?: BackupDetails;
  /**
  * Contains the details of the table when the backup was created.
  */
  SourceTableDetails?: SourceTableDetails;
  /**
  * Contains the details of the features enabled on the table when the backup was created.
  * For example, LSIs, GSIs, streams, TTL.
  */
  SourceTableFeatureDetails?: SourceTableFeatureDetails;
}
/**
 * Contains the details of the backup created for the table.
 */
export interface BackupDetails {
  /**
  * ARN associated with the backup.
  */
  BackupArn: string;
  /**
  * Name of the requested backup.
  */
  BackupName: string;
  /**
  * Size of the backup in bytes. DynamoDB updates this value approximately every six
  * hours. Recent changes might not be reflected in this value.
  */
  BackupSizeBytes?: number;
  /**
  * Backup can be in one of the following states: CREATING, ACTIVE, DELETED.
  */
  BackupStatus: BackupStatus;
  /**
  * BackupType:
  * USER - You create and manage these using the on-demand backup
  * feature.
  * SYSTEM - If you delete a table with point-in-time recovery enabled,
  * a SYSTEM backup is automatically created and is retained for 35
  * days (at no additional cost). System backups allow you to restore the deleted
  * table to the state it was in just before the point of deletion. 
  * AWS_BACKUP - On-demand backup created by you from Backup service.
  */
  BackupType: BackupType;
  /**
  * Time at which the backup was created. This is the request time of the backup.
  */
  BackupCreationDateTime: Date | string;
  /**
  * Time at which the automatic on-demand backup created by DynamoDB will
  * expire. This SYSTEM on-demand backup expires automatically 35 days after
  * its creation.
  */
  BackupExpiryDateTime?: Date | string;
}
/**
 * There is another ongoing conflicting backup control plane operation on the table.
 * The backup is either being created, deleted or restored to a table.
 */
export declare class BackupInUseException extends EffectData.TaggedError(
  "BackupInUseException",
)<{
  readonly message?: string;
}> {}
export type BackupName = string;
/**
 * Backup not found for the given BackupARN.
 */
export declare class BackupNotFoundException extends EffectData.TaggedError(
  "BackupNotFoundException",
)<{
  readonly message?: string;
}> {}
export type BackupsInputLimit = number;
export type BackupSizeBytes = number;
export type BackupStatus = "CREATING" | "DELETED" | "AVAILABLE";
export type BackupSummaries = Array<BackupSummary>;
/**
 * Contains details for the backup.
 */
export interface BackupSummary {
  /**
  * Name of the table.
  */
  TableName?: string;
  /**
  * Unique identifier for the table.
  */
  TableId?: string;
  /**
  * ARN associated with the table.
  */
  TableArn?: string;
  /**
  * ARN associated with the backup.
  */
  BackupArn?: string;
  /**
  * Name of the specified backup.
  */
  BackupName?: string;
  /**
  * Time at which the backup was created.
  */
  BackupCreationDateTime?: Date | string;
  /**
  * Time at which the automatic on-demand backup created by DynamoDB will
  * expire. This SYSTEM on-demand backup expires automatically 35 days after
  * its creation.
  */
  BackupExpiryDateTime?: Date | string;
  /**
  * Backup can be in one of the following states: CREATING, ACTIVE, DELETED.
  */
  BackupStatus?: BackupStatus;
  /**
  * BackupType:
  * USER - You create and manage these using the on-demand backup
  * feature.
  * SYSTEM - If you delete a table with point-in-time recovery enabled,
  * a SYSTEM backup is automatically created and is retained for 35
  * days (at no additional cost). System backups allow you to restore the deleted
  * table to the state it was in just before the point of deletion. 
  * AWS_BACKUP - On-demand backup created by you from Backup service.
  */
  BackupType?: BackupType;
  /**
  * Size of the backup in bytes.
  */
  BackupSizeBytes?: number;
}
export type BackupType = "USER" | "SYSTEM" | "AWS_BACKUP";
export type BackupTypeFilter = "USER" | "SYSTEM" | "AWS_BACKUP" | "ALL";

export interface BatchExecuteStatementInput {
  /**
  * The list of PartiQL statements representing the batch to run.
  */
  Statements: Array<BatchStatementRequest>;
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
}
export interface BatchExecuteStatementOutput {
  /**
  * The response to each PartiQL statement in the batch. The values of the list are
  * ordered according to the ordering of the request statements.
  */
  Responses?: Array<BatchStatementResponse>;
  /**
  * The capacity units consumed by the entire operation. The values of the list are
  * ordered according to the ordering of the statements.
  */
  ConsumedCapacity?: Array<ConsumedCapacity>;
}

/**
 * Represents the input of a BatchGetItem operation.
 */
export interface BatchGetItemInput {
  /**
  * A map of one or more table names or table ARNs and, for each table, a map that
  * describes one or more items to retrieve from that table. Each table name or ARN can be
  * used only once per BatchGetItem request.
  * Each element in the map of items to retrieve consists of the following:
  * ConsistentRead - If true, a strongly consistent read
  * is used; if false (the default), an eventually consistent read is
  * used.
  * ExpressionAttributeNames - One or more substitution tokens for
  * attribute names in the ProjectionExpression parameter. The
  * following are some use cases for using
  * ExpressionAttributeNames:
  * To access an attribute whose name conflicts with a DynamoDB reserved
  * word.
  * To create a placeholder for repeating occurrences of an attribute name
  * in an expression.
  * To prevent special characters in an attribute name from being
  * misinterpreted in an expression.
  * Use the # character in an expression to
  * dereference an attribute name. For example, consider the following attribute
  * name:
  * Percentile
  * The name of this attribute conflicts with a reserved word, so it cannot be
  * used directly in an expression. (For the complete list of reserved words, see
  * Reserved
  * Words in the Amazon DynamoDB Developer Guide).
  * To work around this, you could specify the following for
  * ExpressionAttributeNames:
  * {"#P":"Percentile"}
  * You could then use this substitution in an expression, as in this
  * example:
  * #P = :val
  * Tokens that begin with the : character
  * are expression attribute values, which are placeholders
  * for the actual value at runtime.
  * For more information about expression attribute names, see Accessing Item Attributes in the Amazon DynamoDB
  * Developer Guide.
  * Keys - An array of primary key attribute values that define
  * specific items in the table. For each primary key, you must provide
  * all of the key attributes. For example, with a simple
  * primary key, you only need to provide the partition key value. For a composite
  * key, you must provide both the partition key value and the
  * sort key value.
  * ProjectionExpression - A string that identifies one or more
  * attributes to retrieve from the table. These attributes can include scalars,
  * sets, or elements of a JSON document. The attributes in the expression must be
  * separated by commas.
  * If no attribute names are specified, then all attributes are returned. If any
  * of the requested attributes are not found, they do not appear in the
  * result.
  * For more information, see Accessing Item Attributes in the Amazon DynamoDB
  * Developer Guide.
  * AttributesToGet - This is a legacy parameter. Use
  * ProjectionExpression instead. For more information, see AttributesToGet in the Amazon DynamoDB Developer
  * Guide.
  */
  RequestItems: Record<string, KeysAndAttributes>;
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
}
/**
 * Represents the output of a BatchGetItem operation.
 */
export interface BatchGetItemOutput {
  /**
  * A map of table name or table ARN to a list of items. Each object in
  * Responses consists of a table name or ARN, along with a map of
  * attribute data consisting of the data type and attribute value.
  */
  Responses?: Record<string, Array<Record<string, AttributeValue>>>;
  /**
  * A map of tables and their respective keys that were not processed with the current
  * response. The UnprocessedKeys value is in the same form as
  * RequestItems, so the value can be provided directly to a subsequent
  * BatchGetItem operation. For more information, see
  * RequestItems in the Request Parameters section.
  * Each element consists of:
  * Keys - An array of primary key attribute values that define
  * specific items in the table.
  * ProjectionExpression - One or more attributes to be retrieved from
  * the table or index. By default, all attributes are returned. If a requested
  * attribute is not found, it does not appear in the result.
  * ConsistentRead - The consistency of a read operation. If set to
  * true, then a strongly consistent read is used; otherwise, an
  * eventually consistent read is used.
  * If there are no unprocessed keys remaining, the response contains an empty
  * UnprocessedKeys map.
  */
  UnprocessedKeys?: Record<string, KeysAndAttributes>;
  /**
  * The read capacity units consumed by the entire BatchGetItem
  * operation.
  * Each element consists of:
  * TableName - The table that consumed the provisioned
  * throughput.
  * CapacityUnits - The total number of capacity units consumed.
  */
  ConsumedCapacity?: Array<ConsumedCapacity>;
}
export type BatchGetRequestMap = Record<string, KeysAndAttributes>
export type BatchGetResponseMap = Record<string, Array<Record<string, AttributeValue>>>
/**
 * An error associated with a statement in a PartiQL batch that was run.
 */
export interface BatchStatementError {
  /**
  * The error code associated with the failed PartiQL batch statement.
  */
  Code?: BatchStatementErrorCodeEnum;
  /**
  * The error message associated with the PartiQL batch response.
  */
  Message?: string;
  /**
  * The item which caused the condition check to fail. This will be set if
  * ReturnValuesOnConditionCheckFailure is specified as ALL_OLD.
  */
  Item?: Record<string, AttributeValue>;
}
export type BatchStatementErrorCodeEnum = "ConditionalCheckFailed" | "ItemCollectionSizeLimitExceeded" | "RequestLimitExceeded" | "ValidationError" | "ProvisionedThroughputExceeded" | "TransactionConflict" | "ThrottlingError" | "InternalServerError" | "ResourceNotFound" | "AccessDenied" | "DuplicateItem";
/**
 * A PartiQL batch statement request.
 */
export interface BatchStatementRequest {
  /**
  * A valid PartiQL statement.
  */
  Statement: string;
  /**
  * The parameters associated with a PartiQL statement in the batch request.
  */
  Parameters?: Array<AttributeValue>;
  /**
  * The read consistency of the PartiQL batch request.
  */
  ConsistentRead?: boolean;
  /**
  * An optional parameter that returns the item attributes for a PartiQL batch request
  * operation that failed a condition check.
  * There is no additional cost associated with requesting a return value aside from the
  * small network and processing overhead of receiving a larger response. No read capacity
  * units are consumed.
  */
  ReturnValuesOnConditionCheckFailure?: ReturnValuesOnConditionCheckFailure;
}
/**
 * A PartiQL batch statement response..
 */
export interface BatchStatementResponse {
  /**
  * The error associated with a failed PartiQL batch statement.
  */
  Error?: BatchStatementError;
  /**
  * The table name associated with a failed PartiQL batch statement.
  */
  TableName?: string;
  /**
  * A DynamoDB item associated with a BatchStatementResponse
  */
  Item?: Record<string, AttributeValue>;
}

/**
 * Represents the input of a BatchWriteItem operation.
 */
export interface BatchWriteItemInput {
  /**
  * A map of one or more table names or table ARNs and, for each table, a list of
  * operations to be performed (DeleteRequest or PutRequest). Each
  * element in the map consists of the following:
  * DeleteRequest - Perform a DeleteItem operation on the
  * specified item. The item to be deleted is identified by a Key
  * subelement:
  * Key - A map of primary key attribute values that uniquely
  * identify the item. Each entry in this map consists of an attribute name
  * and an attribute value. For each primary key, you must provide
  * all of the key attributes. For example, with a
  * simple primary key, you only need to provide a value for the partition
  * key. For a composite primary key, you must provide values for
  * both the partition key and the sort key.
  * PutRequest - Perform a PutItem operation on the
  * specified item. The item to be put is identified by an Item
  * subelement:
  * Item - A map of attributes and their values. Each entry in
  * this map consists of an attribute name and an attribute value. Attribute
  * values must not be null; string and binary type attributes must have
  * lengths greater than zero; and set type attributes must not be empty.
  * Requests that contain empty values are rejected with a
  * ValidationException exception.
  * If you specify any attributes that are part of an index key, then the
  * data types for those attributes must match those of the schema in the
  * table's attribute definition.
  */
  RequestItems: Record<string, Array<WriteRequest>>;
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
  /**
  * Determines whether item collection metrics are returned. If set to SIZE,
  * the response includes statistics about item collections, if any, that were modified
  * during the operation are returned in the response. If set to NONE (the
  * default), no statistics are returned.
  */
  ReturnItemCollectionMetrics?: ReturnItemCollectionMetrics;
}
/**
 * Represents the output of a BatchWriteItem operation.
 */
export interface BatchWriteItemOutput {
  /**
  * A map of tables and requests against those tables that were not processed. The
  * UnprocessedItems value is in the same form as
  * RequestItems, so you can provide this value directly to a subsequent
  * BatchWriteItem operation. For more information, see
  * RequestItems in the Request Parameters section.
  * Each UnprocessedItems entry consists of a table name or table ARN
  * and, for that table, a list of operations to perform (DeleteRequest or
  * PutRequest).
  * DeleteRequest - Perform a DeleteItem operation on the
  * specified item. The item to be deleted is identified by a Key
  * subelement:
  * Key - A map of primary key attribute values that uniquely
  * identify the item. Each entry in this map consists of an attribute name
  * and an attribute value.
  * PutRequest - Perform a PutItem operation on the
  * specified item. The item to be put is identified by an Item
  * subelement:
  * Item - A map of attributes and their values. Each entry in
  * this map consists of an attribute name and an attribute value. Attribute
  * values must not be null; string and binary type attributes must have
  * lengths greater than zero; and set type attributes must not be empty.
  * Requests that contain empty values will be rejected with a
  * ValidationException exception.
  * If you specify any attributes that are part of an index key, then the
  * data types for those attributes must match those of the schema in the
  * table's attribute definition.
  * If there are no unprocessed items remaining, the response contains an empty
  * UnprocessedItems map.
  */
  UnprocessedItems?: Record<string, Array<WriteRequest>>;
  /**
  * A list of tables that were processed by BatchWriteItem and, for each
  * table, information about any item collections that were affected by individual
  * DeleteItem or PutItem operations.
  * Each entry consists of the following subelements:
  * ItemCollectionKey - The partition key value of the item collection.
  * This is the same as the partition key value of the item.
  * SizeEstimateRangeGB - An estimate of item collection size,
  * expressed in GB. This is a two-element array containing a lower bound and an
  * upper bound for the estimate. The estimate includes the size of all the items in
  * the table, plus the size of all attributes projected into all of the local
  * secondary indexes on the table. Use this estimate to measure whether a local
  * secondary index is approaching its size limit.
  * The estimate is subject to change over time; therefore, do not rely on the
  * precision or accuracy of the estimate.
  */
  ItemCollectionMetrics?: Record<string, Array<ItemCollectionMetrics>>;
  /**
  * The capacity units consumed by the entire BatchWriteItem
  * operation.
  * Each element consists of:
  * TableName - The table that consumed the provisioned
  * throughput.
  * CapacityUnits - The total number of capacity units consumed.
  */
  ConsumedCapacity?: Array<ConsumedCapacity>;
}
export type BatchWriteItemRequestMap = Record<string, Array<WriteRequest>>
export type BilledSizeBytes = number;
export type BillingMode = "PROVISIONED" | "PAY_PER_REQUEST";
/**
 * Contains the details for the read/write capacity mode. This page talks about
 * PROVISIONED and PAY_PER_REQUEST billing modes. For more
 * information about these modes, see Read/write capacity mode.
 * You may need to switch to on-demand mode at least once in order to return a
 * BillingModeSummary response.
 */
export interface BillingModeSummary {
  /**
  * Controls how you are charged for read and write throughput and how you manage
  * capacity. This setting can be changed later.
  * PROVISIONED - Sets the read/write capacity mode to
  * PROVISIONED. We recommend using PROVISIONED for
  * predictable workloads.
  * PAY_PER_REQUEST - Sets the read/write capacity mode to
  * PAY_PER_REQUEST. We recommend using
  * PAY_PER_REQUEST for unpredictable workloads.
  */
  BillingMode?: BillingMode;
  /**
  * Represents the time when PAY_PER_REQUEST was last set as the read/write
  * capacity mode.
  */
  LastUpdateToPayPerRequestDateTime?: Date | string;
}
export type BinaryAttributeValue = Uint8Array | string;
export type BinarySetAttributeValue = Array<Uint8Array | string>;
export type BooleanAttributeValue = boolean;
export type BooleanObject = boolean;
/**
 * An ordered list of errors for each item in the request which caused the transaction to
 * get cancelled. The values of the list are ordered according to the ordering of the
 * TransactWriteItems request parameter. If no error occurred for the
 * associated item an error with a Null code and Null message will be present.
 */
export interface CancellationReason {
  /**
  * Item in the request which caused the transaction to get cancelled.
  */
  Item?: Record<string, AttributeValue>;
  /**
  * Status code for the result of the cancelled transaction.
  */
  Code?: string;
  /**
  * Cancellation reason message description.
  */
  Message?: string;
}
export type CancellationReasonList = Array<CancellationReason>;
/**
 * Represents the amount of provisioned throughput capacity consumed on a table or an
 * index.
 */
export interface Capacity {
  /**
  * The total number of read capacity units consumed on a table or an index.
  */
  ReadCapacityUnits?: number;
  /**
  * The total number of write capacity units consumed on a table or an index.
  */
  WriteCapacityUnits?: number;
  /**
  * The total number of capacity units consumed on a table or an index.
  */
  CapacityUnits?: number;
}
export type ClientRequestToken = string;
export type ClientToken = string;
export type CloudWatchLogGroupArn = string;
export type Code = string;
export type ComparisonOperator = "EQ" | "NE" | "IN" | "LE" | "LT" | "GE" | "GT" | "BETWEEN" | "NOT_NULL" | "NULL" | "CONTAINS" | "NOT_CONTAINS" | "BEGINS_WITH";
/**
 * Represents the selection criteria for a Query or Scan
 * operation:
 * For a Query operation, Condition is used for
 * specifying the KeyConditions to use when querying a table or an
 * index. For KeyConditions, only the following comparison operators
 * are supported:
 * EQ | LE | LT | GE | GT | BEGINS_WITH | BETWEEN
 * Condition is also used in a QueryFilter, which
 * evaluates the query results and returns only the desired values.
 * For a Scan operation, Condition is used in a
 * ScanFilter, which evaluates the scan results and returns only
 * the desired values.
 */
export interface Condition {
  /**
  * One or more values to evaluate against the supplied attribute. The number of values in
  * the list depends on the ComparisonOperator being used.
  * For type Number, value comparisons are numeric.
  * String value comparisons for greater than, equals, or less than are based on ASCII
  * character code values. For example, a is greater than A, and
  * a is greater than B. For a list of code values, see http://en.wikipedia.org/wiki/ASCII#ASCII_printable_characters.
  * For Binary, DynamoDB treats each byte of the binary data as unsigned when it
  * compares binary values.
  */
  AttributeValueList?: Array<AttributeValue>;
  /**
  * A comparator for evaluating attributes. For example, equals, greater than, less than,
  * etc.
  * The following comparison operators are available:
  * EQ | NE | LE | LT | GE | GT | NOT_NULL | NULL | CONTAINS | NOT_CONTAINS |
  * BEGINS_WITH | IN | BETWEEN
  * The following are descriptions of each comparison operator.
  * EQ : Equal. EQ is supported for all data types,
  * including lists and maps.
  * AttributeValueList can contain only one AttributeValue
  * element of type String, Number, Binary, String Set, Number Set, or Binary Set.
  * If an item contains an AttributeValue element of a different type
  * than the one provided in the request, the value does not match. For example,
  * {"S":"6"} does not equal {"N":"6"}. Also,
  * {"N":"6"} does not equal {"NS":["6", "2",
  * "1"]}.
  * NE : Not equal. NE is supported for all data types,
  * including lists and maps.
  * AttributeValueList can contain only one AttributeValue
  * of type String, Number, Binary, String Set, Number Set, or Binary Set. If an
  * item contains an AttributeValue of a different type than the one
  * provided in the request, the value does not match. For example,
  * {"S":"6"} does not equal {"N":"6"}. Also,
  * {"N":"6"} does not equal {"NS":["6", "2",
  * "1"]}.
  * LE : Less than or equal. 
  * AttributeValueList can contain only one AttributeValue
  * element of type String, Number, or Binary (not a set type). If an item contains
  * an AttributeValue element of a different type than the one provided
  * in the request, the value does not match. For example, {"S":"6"}
  * does not equal {"N":"6"}. Also, {"N":"6"} does not
  * compare to {"NS":["6", "2", "1"]}.
  * LT : Less than. 
  * AttributeValueList can contain only one AttributeValue
  * of type String, Number, or Binary (not a set type). If an item contains an
  * AttributeValue element of a different type than the one
  * provided in the request, the value does not match. For example,
  * {"S":"6"} does not equal {"N":"6"}. Also,
  * {"N":"6"} does not compare to {"NS":["6", "2",
  * "1"]}.
  * GE : Greater than or equal. 
  * AttributeValueList can contain only one AttributeValue
  * element of type String, Number, or Binary (not a set type). If an item contains
  * an AttributeValue element of a different type than the one provided
  * in the request, the value does not match. For example, {"S":"6"}
  * does not equal {"N":"6"}. Also, {"N":"6"} does not
  * compare to {"NS":["6", "2", "1"]}.
  * GT : Greater than. 
  * AttributeValueList can contain only one AttributeValue
  * element of type String, Number, or Binary (not a set type). If an item contains
  * an AttributeValue element of a different type than the one provided
  * in the request, the value does not match. For example, {"S":"6"}
  * does not equal {"N":"6"}. Also, {"N":"6"} does not
  * compare to {"NS":["6", "2", "1"]}.
  * NOT_NULL : The attribute exists. NOT_NULL is supported
  * for all data types, including lists and maps.
  * This operator tests for the existence of an attribute, not its data type.
  * If the data type of attribute "a" is null, and you evaluate it
  * using NOT_NULL, the result is a Boolean true. This
  * result is because the attribute "a" exists; its data type is
  * not relevant to the NOT_NULL comparison operator.
  * NULL : The attribute does not exist. NULL is supported
  * for all data types, including lists and maps.
  * This operator tests for the nonexistence of an attribute, not its data
  * type. If the data type of attribute "a" is null, and you
  * evaluate it using NULL, the result is a Boolean
  * false. This is because the attribute "a"
  * exists; its data type is not relevant to the NULL comparison
  * operator.
  * CONTAINS : Checks for a subsequence, or value in a set.
  * AttributeValueList can contain only one AttributeValue
  * element of type String, Number, or Binary (not a set type). If the target
  * attribute of the comparison is of type String, then the operator checks for a
  * substring match. If the target attribute of the comparison is of type Binary,
  * then the operator looks for a subsequence of the target that matches the input.
  * If the target attribute of the comparison is a set ("SS",
  * "NS", or "BS"), then the operator evaluates to
  * true if it finds an exact match with any member of the set.
  * CONTAINS is supported for lists: When evaluating "a CONTAINS b",
  * "a" can be a list; however, "b" cannot be a set, a
  * map, or a list.
  * NOT_CONTAINS : Checks for absence of a subsequence, or absence of a
  * value in a set.
  * AttributeValueList can contain only one AttributeValue
  * element of type String, Number, or Binary (not a set type). If the target
  * attribute of the comparison is a String, then the operator checks for the
  * absence of a substring match. If the target attribute of the comparison is
  * Binary, then the operator checks for the absence of a subsequence of the target
  * that matches the input. If the target attribute of the comparison is a set
  * ("SS", "NS", or "BS"), then the
  * operator evaluates to true if it does not find an exact
  * match with any member of the set.
  * NOT_CONTAINS is supported for lists: When evaluating "a NOT CONTAINS
  * b", "a" can be a list; however, "b" cannot
  * be a set, a map, or a list.
  * BEGINS_WITH : Checks for a prefix. 
  * AttributeValueList can contain only one AttributeValue
  * of type String or Binary (not a Number or a set type). The target attribute of
  * the comparison must be of type String or Binary (not a Number or a set
  * type).
  * IN : Checks for matching elements in a list.
  * AttributeValueList can contain one or more
  * AttributeValue elements of type String, Number, or Binary.
  * These attributes are compared against an existing attribute of an item. If any
  * elements of the input are equal to the item attribute, the expression evaluates
  * to true.
  * BETWEEN : Greater than or equal to the first value, and less than
  * or equal to the second value. 
  * AttributeValueList must contain two AttributeValue
  * elements of the same type, either String, Number, or Binary (not a set type). A
  * target attribute matches if the target value is greater than, or equal to, the
  * first element and less than, or equal to, the second element. If an item
  * contains an AttributeValue element of a different type than the one
  * provided in the request, the value does not match. For example,
  * {"S":"6"} does not compare to {"N":"6"}. Also,
  * {"N":"6"} does not compare to {"NS":["6", "2",
  * "1"]}
  * For usage examples of AttributeValueList and
  * ComparisonOperator, see Legacy
  * Conditional Parameters in the Amazon DynamoDB Developer
  * Guide.
  */
  ComparisonOperator: ComparisonOperator;
}
/**
 * A condition specified in the operation failed to be evaluated.
 */
export declare class ConditionalCheckFailedException extends EffectData.TaggedError(
  "ConditionalCheckFailedException",
)<{
    /**
   * The conditional request failed.
   */
  readonly message?: string;
    /**
   * Item which caused the ConditionalCheckFailedException.
   */
  readonly Item?: Record<string, AttributeValue>;
}> {}
export type ConditionalOperator = "AND" | "OR";
/**
 * Represents a request to perform a check that an item exists or to check the condition
 * of specific attributes of the item.
 */
export interface ConditionCheck {
  /**
  * The primary key of the item to be checked. Each element consists of an attribute name
  * and a value for that attribute.
  */
  Key: Record<string, AttributeValue>;
  /**
  * Name of the table for the check item request. You can also provide the Amazon Resource Name (ARN) of
  * the table in this parameter.
  */
  TableName: string;
  /**
  * A condition that must be satisfied in order for a conditional update to succeed. For
  * more information, see Condition expressions in the Amazon DynamoDB Developer
  * Guide.
  */
  ConditionExpression: string;
  /**
  * One or more substitution tokens for attribute names in an expression. For more
  * information, see Expression attribute names in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeNames?: Record<string, string>;
  /**
  * One or more values that can be substituted in an expression. For more information, see
  * Condition expressions in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeValues?: Record<string, AttributeValue>;
  /**
  * Use ReturnValuesOnConditionCheckFailure to get the item attributes if the
  * ConditionCheck condition fails. For
  * ReturnValuesOnConditionCheckFailure, the valid values are: NONE and
  * ALL_OLD.
  */
  ReturnValuesOnConditionCheckFailure?: ReturnValuesOnConditionCheckFailure;
}
export type ConditionExpression = string;
export type ConfirmRemoveSelfResourceAccess = boolean;
export type ConsistentRead = boolean;
/**
 * The capacity units consumed by an operation. The data returned includes the total
 * provisioned throughput consumed, along with statistics for the table and any indexes
 * involved in the operation. ConsumedCapacity is only returned if the request
 * asked for it. For more information, see Provisioned capacity mode in the Amazon DynamoDB Developer
 * Guide.
 */
export interface ConsumedCapacity {
  /**
  * The name of the table that was affected by the operation. If you had specified the
  * Amazon Resource Name (ARN) of a table in the input, you'll see the table ARN in the response.
  */
  TableName?: string;
  /**
  * The total number of capacity units consumed by the operation.
  */
  CapacityUnits?: number;
  /**
  * The total number of read capacity units consumed by the operation.
  */
  ReadCapacityUnits?: number;
  /**
  * The total number of write capacity units consumed by the operation.
  */
  WriteCapacityUnits?: number;
  /**
  * The amount of throughput consumed on the table affected by the operation.
  */
  Table?: Capacity;
  /**
  * The amount of throughput consumed on each local index affected by the
  * operation.
  */
  LocalSecondaryIndexes?: Record<string, Capacity>;
  /**
  * The amount of throughput consumed on each global index affected by the
  * operation.
  */
  GlobalSecondaryIndexes?: Record<string, Capacity>;
}
export type ConsumedCapacityMultiple = Array<ConsumedCapacity>;
export type ConsumedCapacityUnits = number;
/**
 * Represents the continuous backups and point in time recovery settings on the
 * table.
 */
export interface ContinuousBackupsDescription {
  /**
  * ContinuousBackupsStatus can be one of the following states: ENABLED,
  * DISABLED
  */
  ContinuousBackupsStatus: ContinuousBackupsStatus;
  /**
  * The description of the point in time recovery settings applied to the table.
  */
  PointInTimeRecoveryDescription?: PointInTimeRecoveryDescription;
}
export type ContinuousBackupsStatus = "ENABLED" | "DISABLED";
/**
 * Backups have not yet been enabled for this table.
 */
export declare class ContinuousBackupsUnavailableException extends EffectData.TaggedError(
  "ContinuousBackupsUnavailableException",
)<{
  readonly message?: string;
}> {}
export type ContributorInsightsAction = "ENABLE" | "DISABLE";
export type ContributorInsightsMode = "ACCESSED_AND_THROTTLED_KEYS" | "THROTTLED_KEYS";
export type ContributorInsightsRule = string;
export type ContributorInsightsRuleList = Array<string>;
export type ContributorInsightsStatus = "ENABLING" | "ENABLED" | "DISABLING" | "DISABLED" | "FAILED";
export type ContributorInsightsSummaries = Array<ContributorInsightsSummary>;
/**
 * Represents a Contributor Insights summary entry.
 */
export interface ContributorInsightsSummary {
  /**
  * Name of the table associated with the summary.
  */
  TableName?: string;
  /**
  * Name of the index associated with the summary, if any.
  */
  IndexName?: string;
  /**
  * Describes the current status for contributor insights for the given table and index,
  * if applicable.
  */
  ContributorInsightsStatus?: ContributorInsightsStatus;
  /**
  * Indicates the current mode of CloudWatch Contributor Insights, specifying whether it
  * tracks all access and throttled events or throttled events only for the DynamoDB
  * table or index.
  */
  ContributorInsightsMode?: ContributorInsightsMode;
}

export interface CreateBackupInput {
  /**
  * The name of the table. You can also provide the Amazon Resource Name (ARN) of the table in this
  * parameter.
  */
  TableName: string;
  /**
  * Specified name for the backup.
  */
  BackupName: string;
}
export interface CreateBackupOutput {
  /**
  * Contains the details of the backup created for the table.
  */
  BackupDetails?: BackupDetails;
}
/**
 * Represents a new global secondary index to be added to an existing table.
 */
export interface CreateGlobalSecondaryIndexAction {
  /**
  * The name of the global secondary index to be created.
  */
  IndexName: string;
  /**
  * The key schema for the global secondary index.
  */
  KeySchema: Array<KeySchemaElement>;
  /**
  * Represents attributes that are copied (projected) from the table into an index. These
  * are in addition to the primary key attributes and index key attributes, which are
  * automatically projected.
  */
  Projection: Projection;
  /**
  * Represents the provisioned throughput settings for the specified global secondary
  * index.
  * For current minimum and maximum provisioned throughput values, see Service,
  * Account, and Table Quotas in the Amazon DynamoDB Developer
  * Guide.
  */
  ProvisionedThroughput?: ProvisionedThroughput;
  /**
  * The maximum number of read and write units for the global secondary index being
  * created. If you use this parameter, you must specify MaxReadRequestUnits,
  * MaxWriteRequestUnits, or both. You must use either OnDemand
  * Throughput or ProvisionedThroughput based on your table's
  * capacity mode.
  */
  OnDemandThroughput?: OnDemandThroughput;
  /**
  * Represents the warm throughput value (in read units per second and write units per
  * second) when creating a secondary index.
  */
  WarmThroughput?: WarmThroughput;
}

export interface CreateGlobalTableInput {
  /**
  * The global table name.
  */
  GlobalTableName: string;
  /**
  * The Regions where the global table needs to be created.
  */
  ReplicationGroup: Array<Replica>;
}
export interface CreateGlobalTableOutput {
  /**
  * Contains the details of the global table.
  */
  GlobalTableDescription?: GlobalTableDescription;
}
/**
 * Specifies the action to add a new witness Region to a MRSC global table. A MRSC global
 * table can be configured with either three replicas, or with two replicas and one
 * witness.
 */
export interface CreateGlobalTableWitnessGroupMemberAction {
  /**
  * The Amazon Web Services Region name to be added as a witness Region for the MRSC global
  * table. The witness must be in a different Region than the replicas and within the same
  * Region set:
  * US Region set: US East (N. Virginia), US East (Ohio), US West (Oregon)
  * EU Region set: Europe (Ireland), Europe (London), Europe (Paris), Europe
  * (Frankfurt)
  * AP Region set: Asia Pacific (Tokyo), Asia Pacific (Seoul), Asia Pacific
  * (Osaka)
  */
  RegionName: string;
}
/**
 * Represents a replica to be added.
 */
export interface CreateReplicaAction {
  /**
  * The Region of the replica to be added.
  */
  RegionName: string;
}
/**
 * Represents a replica to be created.
 */
export interface CreateReplicationGroupMemberAction {
  /**
  * The Region where the new replica will be created.
  */
  RegionName: string;
  /**
  * The KMS key that should be used for KMS encryption in
  * the new replica. To specify a key, use its key ID, Amazon Resource Name (ARN), alias
  * name, or alias ARN. Note that you should only provide this parameter if the key is
  * different from the default DynamoDB KMS key
  * alias/aws/dynamodb.
  */
  KMSMasterKeyId?: string;
  /**
  * Replica-specific provisioned throughput. If not specified, uses the source table's
  * provisioned throughput settings.
  */
  ProvisionedThroughputOverride?: ProvisionedThroughputOverride;
  /**
  * The maximum on-demand throughput settings for the specified replica table being
  * created. You can only modify MaxReadRequestUnits, because you can't modify
  * MaxWriteRequestUnits for individual replica tables.
  */
  OnDemandThroughputOverride?: OnDemandThroughputOverride;
  /**
  * Replica-specific global secondary index settings.
  */
  GlobalSecondaryIndexes?: Array<ReplicaGlobalSecondaryIndex>;
  /**
  * Replica-specific table class. If not specified, uses the source table's table
  * class.
  */
  TableClassOverride?: TableClass;
}

/**
 * Represents the input of a CreateTable operation.
 */
export interface CreateTableInput {
  /**
  * An array of attributes that describe the key schema for the table and indexes.
  */
  AttributeDefinitions: Array<AttributeDefinition>;
  /**
  * The name of the table to create. You can also provide the Amazon Resource Name (ARN) of the table in
  * this parameter.
  */
  TableName: string;
  /**
  * Specifies the attributes that make up the primary key for a table or an index. The
  * attributes in KeySchema must also be defined in the
  * AttributeDefinitions array. For more information, see Data
  * Model in the Amazon DynamoDB Developer Guide.
  * Each KeySchemaElement in the array is composed of:
  * AttributeName - The name of this key attribute.
  * KeyType - The role that the key attribute will assume:
  * HASH - partition key
  * RANGE - sort key
  * The partition key of an item is also known as its hash
  * attribute. The term "hash attribute" derives from the DynamoDB usage
  * of an internal hash function to evenly distribute data items across partitions,
  * based on their partition key values.
  * The sort key of an item is also known as its range attribute.
  * The term "range attribute" derives from the way DynamoDB stores items with the same
  * partition key physically close together, in sorted order by the sort key
  * value.
  * For a simple primary key (partition key), you must provide exactly one element with a
  * KeyType of HASH.
  * For a composite primary key (partition key and sort key), you must provide exactly two
  * elements, in this order: The first element must have a KeyType of
  * HASH, and the second element must have a KeyType of
  * RANGE.
  * For more information, see Working with Tables in the Amazon DynamoDB Developer
  * Guide.
  */
  KeySchema: Array<KeySchemaElement>;
  /**
  * One or more local secondary indexes (the maximum is 5) to be created on the table.
  * Each index is scoped to a given partition key value. There is a 10 GB size limit per
  * partition key value; otherwise, the size of a local secondary index is
  * unconstrained.
  * Each local secondary index in the array includes the following:
  * IndexName - The name of the local secondary index. Must be unique
  * only for this table.
  * KeySchema - Specifies the key schema for the local secondary index.
  * The key schema must begin with the same partition key as the table.
  * Projection - Specifies attributes that are copied (projected) from
  * the table into the index. These are in addition to the primary key attributes
  * and index key attributes, which are automatically projected. Each attribute
  * specification is composed of:
  * ProjectionType - One of the following:
  * KEYS_ONLY - Only the index and primary keys are
  * projected into the index.
  * INCLUDE - Only the specified table attributes are
  * projected into the index. The list of projected attributes is in
  * NonKeyAttributes.
  * ALL - All of the table attributes are projected
  * into the index.
  * NonKeyAttributes - A list of one or more non-key attribute
  * names that are projected into the secondary index. The total count of
  * attributes provided in NonKeyAttributes, summed across all
  * of the secondary indexes, must not exceed 100. If you project the same
  * attribute into two different indexes, this counts as two distinct
  * attributes when determining the total. This limit only applies when you
  * specify the ProjectionType of INCLUDE. You still can
  * specify the ProjectionType of ALL to project all attributes
  * from the source table, even if the table has more than 100
  * attributes.
  */
  LocalSecondaryIndexes?: Array<LocalSecondaryIndex>;
  /**
  * One or more global secondary indexes (the maximum is 20) to be created on the table.
  * Each global secondary index in the array includes the following:
  * IndexName - The name of the global secondary index. Must be unique
  * only for this table.
  * KeySchema - Specifies the key schema for the global secondary
  * index.
  * Projection - Specifies attributes that are copied (projected) from
  * the table into the index. These are in addition to the primary key attributes
  * and index key attributes, which are automatically projected. Each attribute
  * specification is composed of:
  * ProjectionType - One of the following:
  * KEYS_ONLY - Only the index and primary keys are
  * projected into the index.
  * INCLUDE - Only the specified table attributes are
  * projected into the index. The list of projected attributes is in
  * NonKeyAttributes.
  * ALL - All of the table attributes are projected
  * into the index.
  * NonKeyAttributes - A list of one or more non-key attribute
  * names that are projected into the secondary index. The total count of
  * attributes provided in NonKeyAttributes, summed across all
  * of the secondary indexes, must not exceed 100. If you project the same
  * attribute into two different indexes, this counts as two distinct
  * attributes when determining the total. This limit only applies when you
  * specify the ProjectionType of INCLUDE. You still can
  * specify the ProjectionType of ALL to project all attributes
  * from the source table, even if the table has more than 100
  * attributes.
  * ProvisionedThroughput - The provisioned throughput settings for the
  * global secondary index, consisting of read and write capacity units.
  */
  GlobalSecondaryIndexes?: Array<GlobalSecondaryIndex>;
  /**
  * Controls how you are charged for read and write throughput and how you manage
  * capacity. This setting can be changed later.
  * PAY_PER_REQUEST - We recommend using PAY_PER_REQUEST
  * for most DynamoDB workloads. PAY_PER_REQUEST sets the billing mode
  * to On-demand capacity mode. 
  * PROVISIONED - We recommend using PROVISIONED for
  * steady workloads with predictable growth where capacity requirements can be
  * reliably forecasted. PROVISIONED sets the billing mode to Provisioned capacity mode.
  */
  BillingMode?: BillingMode;
  /**
  * Represents the provisioned throughput settings for a specified table or index. The
  * settings can be modified using the UpdateTable operation.
  * If you set BillingMode as PROVISIONED, you must specify this property.
  * If you set BillingMode as PAY_PER_REQUEST, you cannot specify this
  * property.
  * For current minimum and maximum provisioned throughput values, see Service,
  * Account, and Table Quotas in the Amazon DynamoDB Developer
  * Guide.
  */
  ProvisionedThroughput?: ProvisionedThroughput;
  /**
  * The settings for DynamoDB Streams on the table. These settings consist of:
  * StreamEnabled - Indicates whether DynamoDB Streams is to be enabled
  * (true) or disabled (false).
  * StreamViewType - When an item in the table is modified,
  * StreamViewType determines what information is written to the
  * table's stream. Valid values for StreamViewType are:
  * KEYS_ONLY - Only the key attributes of the modified item
  * are written to the stream.
  * NEW_IMAGE - The entire item, as it appears after it was
  * modified, is written to the stream.
  * OLD_IMAGE - The entire item, as it appeared before it was
  * modified, is written to the stream.
  * NEW_AND_OLD_IMAGES - Both the new and the old item images
  * of the item are written to the stream.
  */
  StreamSpecification?: StreamSpecification;
  /**
  * Represents the settings used to enable server-side encryption.
  */
  SSESpecification?: SSESpecification;
  /**
  * A list of key-value pairs to label the table. For more information, see Tagging
  * for DynamoDB.
  */
  Tags?: Array<Tag>;
  /**
  * The table class of the new table. Valid values are STANDARD and
  * STANDARD_INFREQUENT_ACCESS.
  */
  TableClass?: TableClass;
  /**
  * Indicates whether deletion protection is to be enabled (true) or disabled (false) on
  * the table.
  */
  DeletionProtectionEnabled?: boolean;
  /**
  * Represents the warm throughput (in read units per second and write units per second)
  * for creating a table.
  */
  WarmThroughput?: WarmThroughput;
  /**
  * An Amazon Web Services resource-based policy document in JSON format that will be
  * attached to the table.
  * When you attach a resource-based policy while creating a table, the policy application
  * is strongly consistent.
  * The maximum size supported for a resource-based policy document is 20 KB. DynamoDB counts whitespaces when calculating the size of a policy against this
  * limit. For a full list of all considerations that apply for resource-based policies, see
  * Resource-based
  * policy considerations.
  * You need to specify the CreateTable and
  * PutResourcePolicy
  * IAM actions for authorizing a user to create a table with a
  * resource-based policy.
  */
  ResourcePolicy?: string;
  /**
  * Sets the maximum number of read and write units for the specified table in on-demand
  * capacity mode. If you use this parameter, you must specify
  * MaxReadRequestUnits, MaxWriteRequestUnits, or both.
  */
  OnDemandThroughput?: OnDemandThroughput;
}
/**
 * Represents the output of a CreateTable operation.
 */
export interface CreateTableOutput {
  /**
  * Represents the properties of the table.
  */
  TableDescription?: TableDescription;
}
export type CsvDelimiter = string;
export type CsvHeader = string;
export type CsvHeaderList = Array<string>;
/**
 * Processing options for the CSV file being imported.
 */
export interface CsvOptions {
  /**
  * The delimiter used for separating items in the CSV file being imported.
  */
  Delimiter?: string;
  /**
  * List of the headers used to specify a common header for all source CSV files being
  * imported. If this field is specified then the first line of each CSV file is treated as
  * data instead of the header. If this field is not specified the the first line of each
  * CSV file is treated as the header.
  */
  HeaderList?: Array<string>;
}
export type DynamoDBDate = Date | string;
/**
 * Represents a request to perform a DeleteItem operation.
 */
export interface Delete {
  /**
  * The primary key of the item to be deleted. Each element consists of an attribute name
  * and a value for that attribute.
  */
  Key: Record<string, AttributeValue>;
  /**
  * Name of the table in which the item to be deleted resides. You can also provide the
  * Amazon Resource Name (ARN) of the table in this parameter.
  */
  TableName: string;
  /**
  * A condition that must be satisfied in order for a conditional delete to
  * succeed.
  */
  ConditionExpression?: string;
  /**
  * One or more substitution tokens for attribute names in an expression.
  */
  ExpressionAttributeNames?: Record<string, string>;
  /**
  * One or more values that can be substituted in an expression.
  */
  ExpressionAttributeValues?: Record<string, AttributeValue>;
  /**
  * Use ReturnValuesOnConditionCheckFailure to get the item attributes if the
  * Delete condition fails. For
  * ReturnValuesOnConditionCheckFailure, the valid values are: NONE and
  * ALL_OLD.
  */
  ReturnValuesOnConditionCheckFailure?: ReturnValuesOnConditionCheckFailure;
}

export interface DeleteBackupInput {
  /**
  * The ARN associated with the backup.
  */
  BackupArn: string;
}
export interface DeleteBackupOutput {
  /**
  * Contains the description of the backup created for the table.
  */
  BackupDescription?: BackupDescription;
}
/**
 * Represents a global secondary index to be deleted from an existing table.
 */
export interface DeleteGlobalSecondaryIndexAction {
  /**
  * The name of the global secondary index to be deleted.
  */
  IndexName: string;
}
/**
 * Specifies the action to remove a witness Region from a MRSC global table. You cannot
 * delete a single witness from a MRSC global table - you must delete both a replica and
 * the witness together. The deletion of both a witness and replica converts the remaining
 * replica to a single-Region DynamoDB table.
 */
export interface DeleteGlobalTableWitnessGroupMemberAction {
  /**
  * The witness Region name to be removed from the MRSC global table.
  */
  RegionName: string;
}

/**
 * Represents the input of a DeleteItem operation.
 */
export interface DeleteItemInput {
  /**
  * The name of the table from which to delete the item. You can also provide the
  * Amazon Resource Name (ARN) of the table in this parameter.
  */
  TableName: string;
  /**
  * A map of attribute names to AttributeValue objects, representing the
  * primary key of the item to delete.
  * For the primary key, you must provide all of the key attributes. For example, with a
  * simple primary key, you only need to provide a value for the partition key. For a
  * composite primary key, you must provide values for both the partition key and the sort
  * key.
  */
  Key: Record<string, AttributeValue>;
  /**
  * This is a legacy parameter. Use ConditionExpression instead. For more
  * information, see Expected in the Amazon DynamoDB Developer
  * Guide.
  */
  Expected?: Record<string, ExpectedAttributeValue>;
  /**
  * This is a legacy parameter. Use ConditionExpression instead. For more
  * information, see ConditionalOperator in the Amazon DynamoDB Developer
  * Guide.
  */
  ConditionalOperator?: ConditionalOperator;
  /**
  * Use ReturnValues if you want to get the item attributes as they appeared
  * before they were deleted. For DeleteItem, the valid values are:
  * NONE - If ReturnValues is not specified, or if its
  * value is NONE, then nothing is returned. (This setting is the
  * default for ReturnValues.)
  * ALL_OLD - The content of the old item is returned.
  * There is no additional cost associated with requesting a return value aside from the
  * small network and processing overhead of receiving a larger response. No read capacity
  * units are consumed.
  * The ReturnValues parameter is used by several DynamoDB operations;
  * however, DeleteItem does not recognize any values other than
  * NONE or ALL_OLD.
  */
  ReturnValues?: ReturnValue;
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
  /**
  * Determines whether item collection metrics are returned. If set to SIZE,
  * the response includes statistics about item collections, if any, that were modified
  * during the operation are returned in the response. If set to NONE (the
  * default), no statistics are returned.
  */
  ReturnItemCollectionMetrics?: ReturnItemCollectionMetrics;
  /**
  * A condition that must be satisfied in order for a conditional DeleteItem
  * to succeed.
  * An expression can contain any of the following:
  * Functions: attribute_exists | attribute_not_exists | attribute_type |
  * contains | begins_with | size
  * These function names are case-sensitive.
  * Comparison operators: = | <> |
  * | = |
  * BETWEEN | IN 
  * Logical operators: AND | OR | NOT
  * For more information about condition expressions, see Condition Expressions in the Amazon DynamoDB Developer
  * Guide.
  */
  ConditionExpression?: string;
  /**
  * One or more substitution tokens for attribute names in an expression. The following
  * are some use cases for using ExpressionAttributeNames:
  * To access an attribute whose name conflicts with a DynamoDB reserved
  * word.
  * To create a placeholder for repeating occurrences of an attribute name in an
  * expression.
  * To prevent special characters in an attribute name from being misinterpreted
  * in an expression.
  * Use the # character in an expression to dereference
  * an attribute name. For example, consider the following attribute name:
  * Percentile
  * The name of this attribute conflicts with a reserved word, so it cannot be used
  * directly in an expression. (For the complete list of reserved words, see Reserved Words in the Amazon DynamoDB Developer
  * Guide). To work around this, you could specify the following for
  * ExpressionAttributeNames:
  * {"#P":"Percentile"}
  * You could then use this substitution in an expression, as in this example:
  * #P = :val
  * Tokens that begin with the : character are
  * expression attribute values, which are placeholders for the
  * actual value at runtime.
  * For more information on expression attribute names, see Specifying Item Attributes in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeNames?: Record<string, string>;
  /**
  * One or more values that can be substituted in an expression.
  * Use the : (colon) character in an expression to
  * dereference an attribute value. For example, suppose that you wanted to check whether
  * the value of the ProductStatus attribute was one of the following: 
  * Available | Backordered | Discontinued
  * You would first need to specify ExpressionAttributeValues as
  * follows:
  * { ":avail":{"S":"Available"}, ":back":{"S":"Backordered"},
  * ":disc":{"S":"Discontinued"} }
  * You could then use these values in an expression, such as this:
  * ProductStatus IN (:avail, :back, :disc)
  * For more information on expression attribute values, see Condition Expressions in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeValues?: Record<string, AttributeValue>;
  /**
  * An optional parameter that returns the item attributes for a DeleteItem
  * operation that failed a condition check.
  * There is no additional cost associated with requesting a return value aside from the
  * small network and processing overhead of receiving a larger response. No read capacity
  * units are consumed.
  */
  ReturnValuesOnConditionCheckFailure?: ReturnValuesOnConditionCheckFailure;
}
/**
 * Represents the output of a DeleteItem operation.
 */
export interface DeleteItemOutput {
  /**
  * A map of attribute names to AttributeValue objects, representing the item
  * as it appeared before the DeleteItem operation. This map appears in the
  * response only if ReturnValues was specified as ALL_OLD in the
  * request.
  */
  Attributes?: Record<string, AttributeValue>;
  /**
  * The capacity units consumed by the DeleteItem operation. The data
  * returned includes the total provisioned throughput consumed, along with statistics for
  * the table and any indexes involved in the operation. ConsumedCapacity is
  * only returned if the ReturnConsumedCapacity parameter was specified. For
  * more information, see Provisioned capacity mode in the Amazon DynamoDB Developer
  * Guide.
  */
  ConsumedCapacity?: ConsumedCapacity;
  /**
  * Information about item collections, if any, that were affected by the
  * DeleteItem operation. ItemCollectionMetrics is only
  * returned if the ReturnItemCollectionMetrics parameter was specified. If the
  * table does not have any local secondary indexes, this information is not returned in the
  * response.
  * Each ItemCollectionMetrics element consists of:
  * ItemCollectionKey - The partition key value of the item collection.
  * This is the same as the partition key value of the item itself.
  * SizeEstimateRangeGB - An estimate of item collection size, in
  * gigabytes. This value is a two-element array containing a lower bound and an
  * upper bound for the estimate. The estimate includes the size of all the items in
  * the table, plus the size of all attributes projected into all of the local
  * secondary indexes on that table. Use this estimate to measure whether a local
  * secondary index is approaching its size limit.
  * The estimate is subject to change over time; therefore, do not rely on the
  * precision or accuracy of the estimate.
  */
  ItemCollectionMetrics?: ItemCollectionMetrics;
}
/**
 * Represents a replica to be removed.
 */
export interface DeleteReplicaAction {
  /**
  * The Region of the replica to be removed.
  */
  RegionName: string;
}
/**
 * Represents a replica to be deleted.
 */
export interface DeleteReplicationGroupMemberAction {
  /**
  * The Region where the replica exists.
  */
  RegionName: string;
}
/**
 * Represents a request to perform a DeleteItem operation on an item.
 */
export interface DeleteRequest {
  /**
  * A map of attribute name to attribute values, representing the primary key of the item
  * to delete. All of the table's primary key attributes must be specified, and their data
  * types must match those of the table's key schema.
  */
  Key: Record<string, AttributeValue>;
}

export interface DeleteResourcePolicyInput {
  /**
  * The Amazon Resource Name (ARN) of the DynamoDB resource from which the policy will be
  * removed. The resources you can specify include tables and streams. If you remove the
  * policy of a table, it will also remove the permissions for the table's indexes defined
  * in that policy document. This is because index permissions are defined in the table's
  * policy.
  */
  ResourceArn: string;
  /**
  * A string value that you can use to conditionally delete your policy. When you provide
  * an expected revision ID, if the revision ID of the existing policy on the resource
  * doesn't match or if there's no policy attached to the resource, the request will fail
  * and return a PolicyNotFoundException.
  */
  ExpectedRevisionId?: string;
}
export interface DeleteResourcePolicyOutput {
  /**
  * A unique string that represents the revision ID of the policy. If you're comparing revision IDs, make sure to always use string comparison logic.
  * This value will be empty if you make a request against a resource without a
  * policy.
  */
  RevisionId?: string;
}

/**
 * Represents the input of a DeleteTable operation.
 */
export interface DeleteTableInput {
  /**
  * The name of the table to delete. You can also provide the Amazon Resource Name (ARN) of the table in
  * this parameter.
  */
  TableName: string;
}
/**
 * Represents the output of a DeleteTable operation.
 */
export interface DeleteTableOutput {
  /**
  * Represents the properties of a table.
  */
  TableDescription?: TableDescription;
}
export type DeletionProtectionEnabled = boolean;

export interface DescribeBackupInput {
  /**
  * The Amazon Resource Name (ARN) associated with the backup.
  */
  BackupArn: string;
}
export interface DescribeBackupOutput {
  /**
  * Contains the description of the backup created for the table.
  */
  BackupDescription?: BackupDescription;
}

export interface DescribeContinuousBackupsInput {
  /**
  * Name of the table for which the customer wants to check the continuous backups and
  * point in time recovery settings.
  * You can also provide the Amazon Resource Name (ARN) of the table in this parameter.
  */
  TableName: string;
}
export interface DescribeContinuousBackupsOutput {
  /**
  * Represents the continuous backups and point in time recovery settings on the
  * table.
  */
  ContinuousBackupsDescription?: ContinuousBackupsDescription;
}

export interface DescribeContributorInsightsInput {
  /**
  * The name of the table to describe. You can also provide the Amazon Resource Name (ARN) of the table in
  * this parameter.
  */
  TableName: string;
  /**
  * The name of the global secondary index to describe, if applicable.
  */
  IndexName?: string;
}
export interface DescribeContributorInsightsOutput {
  /**
  * The name of the table being described.
  */
  TableName?: string;
  /**
  * The name of the global secondary index being described.
  */
  IndexName?: string;
  /**
  * List of names of the associated contributor insights rules.
  */
  ContributorInsightsRuleList?: Array<string>;
  /**
  * Current status of contributor insights.
  */
  ContributorInsightsStatus?: ContributorInsightsStatus;
  /**
  * Timestamp of the last time the status was changed.
  */
  LastUpdateDateTime?: Date | string;
  /**
  * Returns information about the last failure that was encountered.
  * The most common exceptions for a FAILED status are:
  * LimitExceededException - Per-account Amazon CloudWatch Contributor Insights
  * rule limit reached. Please disable Contributor Insights for other tables/indexes
  * OR disable Contributor Insights rules before retrying.
  * AccessDeniedException - Amazon CloudWatch Contributor Insights rules cannot be
  * modified due to insufficient permissions.
  * AccessDeniedException - Failed to create service-linked role for Contributor
  * Insights due to insufficient permissions.
  * InternalServerError - Failed to create Amazon CloudWatch Contributor Insights
  * rules. Please retry request.
  */
  FailureException?: FailureException;
  /**
  * The mode of CloudWatch Contributor Insights for DynamoDB that determines
  * which events are emitted. Can be set to track all access and throttled events or throttled
  * events only.
  */
  ContributorInsightsMode?: ContributorInsightsMode;
}

export interface DescribeEndpointsRequest {
}
export interface DescribeEndpointsResponse {
  /**
  * List of endpoints.
  */
  Endpoints: Array<Endpoint>;
}

export interface DescribeExportInput {
  /**
  * The Amazon Resource Name (ARN) associated with the export.
  */
  ExportArn: string;
}
export interface DescribeExportOutput {
  /**
  * Represents the properties of the export.
  */
  ExportDescription?: ExportDescription;
}

export interface DescribeGlobalTableInput {
  /**
  * The name of the global table.
  */
  GlobalTableName: string;
}
export interface DescribeGlobalTableOutput {
  /**
  * Contains the details of the global table.
  */
  GlobalTableDescription?: GlobalTableDescription;
}

export interface DescribeGlobalTableSettingsInput {
  /**
  * The name of the global table to describe.
  */
  GlobalTableName: string;
}
export interface DescribeGlobalTableSettingsOutput {
  /**
  * The name of the global table.
  */
  GlobalTableName?: string;
  /**
  * The Region-specific settings for the global table.
  */
  ReplicaSettings?: Array<ReplicaSettingsDescription>;
}

export interface DescribeImportInput {
  /**
  * The Amazon Resource Name (ARN) associated with the table you're importing to.
  */
  ImportArn: string;
}
export interface DescribeImportOutput {
  /**
  * Represents the properties of the table created for the import, and parameters of the
  * import. The import parameters include import status, how many items were processed, and
  * how many errors were encountered.
  */
  ImportTableDescription: ImportTableDescription;
}

export interface DescribeKinesisStreamingDestinationInput {
  /**
  * The name of the table being described. You can also provide the Amazon Resource Name (ARN) of the table
  * in this parameter.
  */
  TableName: string;
}
export interface DescribeKinesisStreamingDestinationOutput {
  /**
  * The name of the table being described.
  */
  TableName?: string;
  /**
  * The list of replica structures for the table being described.
  */
  KinesisDataStreamDestinations?: Array<KinesisDataStreamDestination>;
}

/**
 * Represents the input of a DescribeLimits operation. Has no
 * content.
 */
export interface DescribeLimitsInput {
}
/**
 * Represents the output of a DescribeLimits operation.
 */
export interface DescribeLimitsOutput {
  /**
  * The maximum total read capacity units that your account allows you to provision across
  * all of your tables in this Region.
  */
  AccountMaxReadCapacityUnits?: number;
  /**
  * The maximum total write capacity units that your account allows you to provision
  * across all of your tables in this Region.
  */
  AccountMaxWriteCapacityUnits?: number;
  /**
  * The maximum read capacity units that your account allows you to provision for a new
  * table that you are creating in this Region, including the read capacity units
  * provisioned for its global secondary indexes (GSIs).
  */
  TableMaxReadCapacityUnits?: number;
  /**
  * The maximum write capacity units that your account allows you to provision for a new
  * table that you are creating in this Region, including the write capacity units
  * provisioned for its global secondary indexes (GSIs).
  */
  TableMaxWriteCapacityUnits?: number;
}

/**
 * Represents the input of a DescribeTable operation.
 */
export interface DescribeTableInput {
  /**
  * The name of the table to describe. You can also provide the Amazon Resource Name (ARN) of the table in
  * this parameter.
  */
  TableName: string;
}
/**
 * Represents the output of a DescribeTable operation.
 */
export interface DescribeTableOutput {
  /**
  * The properties of the table.
  */
  Table?: TableDescription;
}

export interface DescribeTableReplicaAutoScalingInput {
  /**
  * The name of the table. You can also provide the Amazon Resource Name (ARN) of the table in this
  * parameter.
  */
  TableName: string;
}
export interface DescribeTableReplicaAutoScalingOutput {
  /**
  * Represents the auto scaling properties of the table.
  */
  TableAutoScalingDescription?: TableAutoScalingDescription;
}

export interface DescribeTimeToLiveInput {
  /**
  * The name of the table to be described. You can also provide the Amazon Resource Name (ARN) of the table
  * in this parameter.
  */
  TableName: string;
}
export interface DescribeTimeToLiveOutput {
  TimeToLiveDescription?: TimeToLiveDescription;
}
export type DestinationStatus = "ENABLING" | "ACTIVE" | "DISABLING" | "DISABLED" | "ENABLE_FAILED" | "UPDATING";

export type DoubleObject = number;
/**
 * There was an attempt to insert an item with the same primary key as an item that
 * already exists in the DynamoDB table.
 */
export declare class DuplicateItemException extends EffectData.TaggedError(
  "DuplicateItemException",
)<{
  readonly message?: string;
}> {}

/**
 * Enables setting the configuration for Kinesis Streaming.
 */
export interface EnableKinesisStreamingConfiguration {
  /**
  * Toggle for the precision of Kinesis data stream timestamp. The values are either
  * MILLISECOND or MICROSECOND.
  */
  ApproximateCreationDateTimePrecision?: ApproximateCreationDateTimePrecision;
}

/**
 * An endpoint information details.
 */
export interface Endpoint {
  /**
  * IP address of the endpoint.
  */
  Address: string;
  /**
  * Endpoint cache time to live (TTL) value.
  */
  CachePeriodInMinutes: number;
}
export type Endpoints = Array<Endpoint>;
export type ErrorCount = number;
export type ErrorMessage = string;
export type ExceptionDescription = string;
export type ExceptionName = string;

export interface ExecuteStatementInput {
  /**
  * The PartiQL statement representing the operation to run.
  */
  Statement: string;
  /**
  * The parameters for the PartiQL statement, if any.
  */
  Parameters?: Array<AttributeValue>;
  /**
  * The consistency of a read operation. If set to true, then a strongly
  * consistent read is used; otherwise, an eventually consistent read is used.
  */
  ConsistentRead?: boolean;
  /**
  * Set this value to get remaining results, if NextToken was returned in the
  * statement response.
  */
  NextToken?: string;
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
  /**
  * The maximum number of items to evaluate (not necessarily the number of matching
  * items). If DynamoDB processes the number of items up to the limit while processing the
  * results, it stops the operation and returns the matching values up to that point, along
  * with a key in LastEvaluatedKey to apply in a subsequent operation so you
  * can pick up where you left off. Also, if the processed dataset size exceeds 1 MB before
  * DynamoDB reaches this limit, it stops the operation and returns the matching values up
  * to the limit, and a key in LastEvaluatedKey to apply in a subsequent
  * operation to continue the operation.
  */
  Limit?: number;
  /**
  * An optional parameter that returns the item attributes for an
  * ExecuteStatement operation that failed a condition check.
  * There is no additional cost associated with requesting a return value aside from the
  * small network and processing overhead of receiving a larger response. No read capacity
  * units are consumed.
  */
  ReturnValuesOnConditionCheckFailure?: ReturnValuesOnConditionCheckFailure;
}
export interface ExecuteStatementOutput {
  /**
  * If a read operation was used, this property will contain the result of the read
  * operation; a map of attribute names and their values. For the write operations this
  * value will be empty.
  */
  Items?: Array<Record<string, AttributeValue>>;
  /**
  * If the response of a read request exceeds the response payload limit DynamoDB will set
  * this value in the response. If set, you can use that this value in the subsequent
  * request to get the remaining results.
  */
  NextToken?: string;
  ConsumedCapacity?: ConsumedCapacity;
  /**
  * The primary key of the item where the operation stopped, inclusive of the previous
  * result set. Use this value to start a new operation, excluding this value in the new
  * request. If LastEvaluatedKey is empty, then the "last page" of results has
  * been processed and there is no more data to be retrieved. If
  * LastEvaluatedKey is not empty, it does not necessarily mean that there
  * is more data in the result set. The only way to know when you have reached the end of
  * the result set is when LastEvaluatedKey is empty.
  */
  LastEvaluatedKey?: Record<string, AttributeValue>;
}

export interface ExecuteTransactionInput {
  /**
  * The list of PartiQL statements representing the transaction to run.
  */
  TransactStatements: Array<ParameterizedStatement>;
  /**
  * Set this value to get remaining results, if NextToken was returned in the
  * statement response.
  */
  ClientRequestToken?: string;
  /**
  * Determines the level of detail about either provisioned or on-demand throughput
  * consumption that is returned in the response. For more information, see TransactGetItems and TransactWriteItems.
  */
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
}
export interface ExecuteTransactionOutput {
  /**
  * The response to a PartiQL transaction.
  */
  Responses?: Array<ItemResponse>;
  /**
  * The capacity units consumed by the entire operation. The values of the list are
  * ordered according to the ordering of the statements.
  */
  ConsumedCapacity?: Array<ConsumedCapacity>;
}
export type ExpectedAttributeMap = Record<string, ExpectedAttributeValue>
/**
 * Represents a condition to be compared with an attribute value. This condition can be
 * used with DeleteItem, PutItem, or UpdateItem
 * operations; if the comparison evaluates to true, the operation succeeds; if not, the
 * operation fails. You can use ExpectedAttributeValue in one of two different
 * ways:
 * Use AttributeValueList to specify one or more values to compare
 * against an attribute. Use ComparisonOperator to specify how you
 * want to perform the comparison. If the comparison evaluates to true, then the
 * conditional operation succeeds.
 * Use Value to specify a value that DynamoDB will compare against
 * an attribute. If the values match, then ExpectedAttributeValue
 * evaluates to true and the conditional operation succeeds. Optionally, you can
 * also set Exists to false, indicating that you do
 * not expect to find the attribute value in the table. In this
 * case, the conditional operation succeeds only if the comparison evaluates to
 * false.
 * Value and Exists are incompatible with
 * AttributeValueList and ComparisonOperator. Note that if
 * you use both sets of parameters at once, DynamoDB will return a
 * ValidationException exception.
 */
export interface ExpectedAttributeValue {
  /**
  * Represents the data for the expected attribute.
  * Each attribute value is described as a name-value pair. The name is the data type, and
  * the value is the data itself.
  * For more information, see Data Types in the Amazon DynamoDB Developer
  * Guide.
  */
  Value?: AttributeValue;
  /**
  * Causes DynamoDB to evaluate the value before attempting a conditional
  * operation:
  * If Exists is true, DynamoDB will check to
  * see if that attribute value already exists in the table. If it is found, then
  * the operation succeeds. If it is not found, the operation fails with a
  * ConditionCheckFailedException.
  * If Exists is false, DynamoDB assumes that
  * the attribute value does not exist in the table. If in fact the value does not
  * exist, then the assumption is valid and the operation succeeds. If the value is
  * found, despite the assumption that it does not exist, the operation fails with a
  * ConditionCheckFailedException.
  * The default setting for Exists is true. If you supply a
  * Value all by itself, DynamoDB assumes the attribute exists:
  * You don't have to set Exists to true, because it is
  * implied.
  * DynamoDB returns a ValidationException if:
  * Exists is true but there is no Value to
  * check. (You expect a value to exist, but don't specify what that value
  * is.)
  * Exists is false but you also provide a
  * Value. (You cannot expect an attribute to have a value, while
  * also expecting it not to exist.)
  */
  Exists?: boolean;
  /**
  * A comparator for evaluating attributes in the AttributeValueList. For
  * example, equals, greater than, less than, etc.
  * The following comparison operators are available:
  * EQ | NE | LE | LT | GE | GT | NOT_NULL | NULL | CONTAINS | NOT_CONTAINS |
  * BEGINS_WITH | IN | BETWEEN
  * The following are descriptions of each comparison operator.
  * EQ : Equal. EQ is supported for all data types,
  * including lists and maps.
  * AttributeValueList can contain only one AttributeValue
  * element of type String, Number, Binary, String Set, Number Set, or Binary Set.
  * If an item contains an AttributeValue element of a different type
  * than the one provided in the request, the value does not match. For example,
  * {"S":"6"} does not equal {"N":"6"}. Also,
  * {"N":"6"} does not equal {"NS":["6", "2",
  * "1"]}.
  * NE : Not equal. NE is supported for all data types,
  * including lists and maps.
  * AttributeValueList can contain only one AttributeValue
  * of type String, Number, Binary, String Set, Number Set, or Binary Set. If an
  * item contains an AttributeValue of a different type than the one
  * provided in the request, the value does not match. For example,
  * {"S":"6"} does not equal {"N":"6"}. Also,
  * {"N":"6"} does not equal {"NS":["6", "2",
  * "1"]}.
  * LE : Less than or equal. 
  * AttributeValueList can contain only one AttributeValue
  * element of type String, Number, or Binary (not a set type). If an item contains
  * an AttributeValue element of a different type than the one provided
  * in the request, the value does not match. For example, {"S":"6"}
  * does not equal {"N":"6"}. Also, {"N":"6"} does not
  * compare to {"NS":["6", "2", "1"]}.
  * LT : Less than. 
  * AttributeValueList can contain only one AttributeValue
  * of type String, Number, or Binary (not a set type). If an item contains an
  * AttributeValue element of a different type than the one
  * provided in the request, the value does not match. For example,
  * {"S":"6"} does not equal {"N":"6"}. Also,
  * {"N":"6"} does not compare to {"NS":["6", "2",
  * "1"]}.
  * GE : Greater than or equal. 
  * AttributeValueList can contain only one AttributeValue
  * element of type String, Number, or Binary (not a set type). If an item contains
  * an AttributeValue element of a different type than the one provided
  * in the request, the value does not match. For example, {"S":"6"}
  * does not equal {"N":"6"}. Also, {"N":"6"} does not
  * compare to {"NS":["6", "2", "1"]}.
  * GT : Greater than. 
  * AttributeValueList can contain only one AttributeValue
  * element of type String, Number, or Binary (not a set type). If an item contains
  * an AttributeValue element of a different type than the one provided
  * in the request, the value does not match. For example, {"S":"6"}
  * does not equal {"N":"6"}. Also, {"N":"6"} does not
  * compare to {"NS":["6", "2", "1"]}.
  * NOT_NULL : The attribute exists. NOT_NULL is supported
  * for all data types, including lists and maps.
  * This operator tests for the existence of an attribute, not its data type.
  * If the data type of attribute "a" is null, and you evaluate it
  * using NOT_NULL, the result is a Boolean true. This
  * result is because the attribute "a" exists; its data type is
  * not relevant to the NOT_NULL comparison operator.
  * NULL : The attribute does not exist. NULL is supported
  * for all data types, including lists and maps.
  * This operator tests for the nonexistence of an attribute, not its data
  * type. If the data type of attribute "a" is null, and you
  * evaluate it using NULL, the result is a Boolean
  * false. This is because the attribute "a"
  * exists; its data type is not relevant to the NULL comparison
  * operator.
  * CONTAINS : Checks for a subsequence, or value in a set.
  * AttributeValueList can contain only one AttributeValue
  * element of type String, Number, or Binary (not a set type). If the target
  * attribute of the comparison is of type String, then the operator checks for a
  * substring match. If the target attribute of the comparison is of type Binary,
  * then the operator looks for a subsequence of the target that matches the input.
  * If the target attribute of the comparison is a set ("SS",
  * "NS", or "BS"), then the operator evaluates to
  * true if it finds an exact match with any member of the set.
  * CONTAINS is supported for lists: When evaluating "a CONTAINS b",
  * "a" can be a list; however, "b" cannot be a set, a
  * map, or a list.
  * NOT_CONTAINS : Checks for absence of a subsequence, or absence of a
  * value in a set.
  * AttributeValueList can contain only one AttributeValue
  * element of type String, Number, or Binary (not a set type). If the target
  * attribute of the comparison is a String, then the operator checks for the
  * absence of a substring match. If the target attribute of the comparison is
  * Binary, then the operator checks for the absence of a subsequence of the target
  * that matches the input. If the target attribute of the comparison is a set
  * ("SS", "NS", or "BS"), then the
  * operator evaluates to true if it does not find an exact
  * match with any member of the set.
  * NOT_CONTAINS is supported for lists: When evaluating "a NOT CONTAINS
  * b", "a" can be a list; however, "b" cannot
  * be a set, a map, or a list.
  * BEGINS_WITH : Checks for a prefix. 
  * AttributeValueList can contain only one AttributeValue
  * of type String or Binary (not a Number or a set type). The target attribute of
  * the comparison must be of type String or Binary (not a Number or a set
  * type).
  * IN : Checks for matching elements in a list.
  * AttributeValueList can contain one or more
  * AttributeValue elements of type String, Number, or Binary.
  * These attributes are compared against an existing attribute of an item. If any
  * elements of the input are equal to the item attribute, the expression evaluates
  * to true.
  * BETWEEN : Greater than or equal to the first value, and less than
  * or equal to the second value. 
  * AttributeValueList must contain two AttributeValue
  * elements of the same type, either String, Number, or Binary (not a set type). A
  * target attribute matches if the target value is greater than, or equal to, the
  * first element and less than, or equal to, the second element. If an item
  * contains an AttributeValue element of a different type than the one
  * provided in the request, the value does not match. For example,
  * {"S":"6"} does not compare to {"N":"6"}. Also,
  * {"N":"6"} does not compare to {"NS":["6", "2",
  * "1"]}
  */
  ComparisonOperator?: ComparisonOperator;
  /**
  * One or more values to evaluate against the supplied attribute. The number of values in
  * the list depends on the ComparisonOperator being used.
  * For type Number, value comparisons are numeric.
  * String value comparisons for greater than, equals, or less than are based on ASCII
  * character code values. For example, a is greater than A, and
  * a is greater than B. For a list of code values, see http://en.wikipedia.org/wiki/ASCII#ASCII_printable_characters.
  * For Binary, DynamoDB treats each byte of the binary data as unsigned when it
  * compares binary values.
  * For information on specifying data types in JSON, see JSON Data Format
  * in the Amazon DynamoDB Developer Guide.
  */
  AttributeValueList?: Array<AttributeValue>;
}
export type ExportArn = string;
/**
 * There was a conflict when writing to the specified S3 bucket.
 */
export declare class ExportConflictException extends EffectData.TaggedError(
  "ExportConflictException",
)<{
  readonly message?: string;
}> {}
/**
 * Represents the properties of the exported table.
 */
export interface ExportDescription {
  /**
  * The Amazon Resource Name (ARN) of the table export.
  */
  ExportArn?: string;
  /**
  * Export can be in one of the following states: IN_PROGRESS, COMPLETED, or
  * FAILED.
  */
  ExportStatus?: ExportStatus;
  /**
  * The time at which the export task began.
  */
  StartTime?: Date | string;
  /**
  * The time at which the export task completed.
  */
  EndTime?: Date | string;
  /**
  * The name of the manifest file for the export task.
  */
  ExportManifest?: string;
  /**
  * The Amazon Resource Name (ARN) of the table that was exported.
  */
  TableArn?: string;
  /**
  * Unique ID of the table that was exported.
  */
  TableId?: string;
  /**
  * Point in time from which table data was exported.
  */
  ExportTime?: Date | string;
  /**
  * The client token that was provided for the export task. A client token makes calls to
  * ExportTableToPointInTimeInput idempotent, meaning that multiple
  * identical calls have the same effect as one single call.
  */
  ClientToken?: string;
  /**
  * The name of the Amazon S3 bucket containing the export.
  */
  S3Bucket?: string;
  /**
  * The ID of the Amazon Web Services account that owns the bucket containing the
  * export.
  */
  S3BucketOwner?: string;
  /**
  * The Amazon S3 bucket prefix used as the file name and path of the exported
  * snapshot.
  */
  S3Prefix?: string;
  /**
  * Type of encryption used on the bucket where export data is stored. Valid values for
  * S3SseAlgorithm are:
  * AES256 - server-side encryption with Amazon S3 managed
  * keys
  * KMS - server-side encryption with KMS managed
  * keys
  */
  S3SseAlgorithm?: S3SseAlgorithm;
  /**
  * The ID of the KMS managed key used to encrypt the S3 bucket where
  * export data is stored (if applicable).
  */
  S3SseKmsKeyId?: string;
  /**
  * Status code for the result of the failed export.
  */
  FailureCode?: string;
  /**
  * Export failure reason description.
  */
  FailureMessage?: string;
  /**
  * The format of the exported data. Valid values for ExportFormat are
  * DYNAMODB_JSON or ION.
  */
  ExportFormat?: ExportFormat;
  /**
  * The billable size of the table export.
  */
  BilledSizeBytes?: number;
  /**
  * The number of items exported.
  */
  ItemCount?: number;
  /**
  * The type of export that was performed. Valid values are FULL_EXPORT or
  * INCREMENTAL_EXPORT.
  */
  ExportType?: ExportType;
  /**
  * Optional object containing the parameters specific to an incremental export.
  */
  IncrementalExportSpecification?: IncrementalExportSpecification;
}
export type ExportEndTime = Date | string;
export type ExportFormat = "DYNAMODB_JSON" | "ION";
export type ExportFromTime = Date | string;
export type ExportManifest = string;
export type ExportNextToken = string;
/**
 * The specified export was not found.
 */
export declare class ExportNotFoundException extends EffectData.TaggedError(
  "ExportNotFoundException",
)<{
  readonly message?: string;
}> {}
export type ExportStartTime = Date | string;
export type ExportStatus = "IN_PROGRESS" | "COMPLETED" | "FAILED";
export type ExportSummaries = Array<ExportSummary>;
/**
 * Summary information about an export task.
 */
export interface ExportSummary {
  /**
  * The Amazon Resource Name (ARN) of the export.
  */
  ExportArn?: string;
  /**
  * Export can be in one of the following states: IN_PROGRESS, COMPLETED, or
  * FAILED.
  */
  ExportStatus?: ExportStatus;
  /**
  * The type of export that was performed. Valid values are FULL_EXPORT or
  * INCREMENTAL_EXPORT.
  */
  ExportType?: ExportType;
}

export interface ExportTableToPointInTimeInput {
  /**
  * The Amazon Resource Name (ARN) associated with the table to export.
  */
  TableArn: string;
  /**
  * Time in the past from which to export table data, counted in seconds from the start of
  * the Unix epoch. The table export will be a snapshot of the table's state at this point
  * in time.
  */
  ExportTime?: Date | string;
  /**
  * Providing a ClientToken makes the call to
  * ExportTableToPointInTimeInput idempotent, meaning that multiple
  * identical calls have the same effect as one single call.
  * A client token is valid for 8 hours after the first request that uses it is completed.
  * After 8 hours, any request with the same client token is treated as a new request. Do
  * not resubmit the same request with the same client token for more than 8 hours, or the
  * result might not be idempotent.
  * If you submit a request with the same client token but a change in other parameters
  * within the 8-hour idempotency window, DynamoDB returns an
  * ImportConflictException.
  */
  ClientToken?: string;
  /**
  * The name of the Amazon S3 bucket to export the snapshot to.
  */
  S3Bucket: string;
  /**
  * The ID of the Amazon Web Services account that owns the bucket the export will be
  * stored in.
  * S3BucketOwner is a required parameter when exporting to a S3 bucket in another
  * account.
  */
  S3BucketOwner?: string;
  /**
  * The Amazon S3 bucket prefix to use as the file name and path of the exported
  * snapshot.
  */
  S3Prefix?: string;
  /**
  * Type of encryption used on the bucket where export data will be stored. Valid values
  * for S3SseAlgorithm are:
  * AES256 - server-side encryption with Amazon S3 managed
  * keys
  * KMS - server-side encryption with KMS managed
  * keys
  */
  S3SseAlgorithm?: S3SseAlgorithm;
  /**
  * The ID of the KMS managed key used to encrypt the S3 bucket where
  * export data will be stored (if applicable).
  */
  S3SseKmsKeyId?: string;
  /**
  * The format for the exported data. Valid values for ExportFormat are
  * DYNAMODB_JSON or ION.
  */
  ExportFormat?: ExportFormat;
  /**
  * Choice of whether to execute as a full export or incremental export. Valid values are
  * FULL_EXPORT or INCREMENTAL_EXPORT. The default value is FULL_EXPORT. If
  * INCREMENTAL_EXPORT is provided, the IncrementalExportSpecification must also be
  * used.
  */
  ExportType?: ExportType;
  /**
  * Optional object containing the parameters specific to an incremental export.
  */
  IncrementalExportSpecification?: IncrementalExportSpecification;
}
export interface ExportTableToPointInTimeOutput {
  /**
  * Contains a description of the table export.
  */
  ExportDescription?: ExportDescription;
}
export type ExportTime = Date | string;
export type ExportToTime = Date | string;
export type ExportType = "FULL_EXPORT" | "INCREMENTAL_EXPORT";
export type ExportViewType = "NEW_IMAGE" | "NEW_AND_OLD_IMAGES";
export type ExpressionAttributeNameMap = Record<string, string>
export type ExpressionAttributeNameVariable = string;
export type ExpressionAttributeValueMap = Record<string, AttributeValue>
export type ExpressionAttributeValueVariable = string;
export type FailureCode = string;
/**
 * Represents a failure a contributor insights operation.
 */
export interface FailureException {
  /**
  * Exception name.
  */
  ExceptionName?: string;
  /**
  * Description of the failure.
  */
  ExceptionDescription?: string;
}
export type FailureMessage = string;
export type FilterConditionMap = Record<string, Condition>
/**
 * Specifies an item and related attribute values to retrieve in a
 * TransactGetItem object.
 */
export interface Get {
  /**
  * A map of attribute names to AttributeValue objects that specifies the
  * primary key of the item to retrieve.
  */
  Key: Record<string, AttributeValue>;
  /**
  * The name of the table from which to retrieve the specified item. You can also provide
  * the Amazon Resource Name (ARN) of the table in this parameter.
  */
  TableName: string;
  /**
  * A string that identifies one or more attributes of the specified item to retrieve from
  * the table. The attributes in the expression must be separated by commas. If no attribute
  * names are specified, then all attributes of the specified item are returned. If any of
  * the requested attributes are not found, they do not appear in the result.
  */
  ProjectionExpression?: string;
  /**
  * One or more substitution tokens for attribute names in the ProjectionExpression
  * parameter.
  */
  ExpressionAttributeNames?: Record<string, string>;
}

/**
 * Represents the input of a GetItem operation.
 */
export interface GetItemInput {
  /**
  * The name of the table containing the requested item. You can also provide the
  * Amazon Resource Name (ARN) of the table in this parameter.
  */
  TableName: string;
  /**
  * A map of attribute names to AttributeValue objects, representing the
  * primary key of the item to retrieve.
  * For the primary key, you must provide all of the attributes. For example, with a
  * simple primary key, you only need to provide a value for the partition key. For a
  * composite primary key, you must provide values for both the partition key and the sort
  * key.
  */
  Key: Record<string, AttributeValue>;
  /**
  * This is a legacy parameter. Use ProjectionExpression instead. For more
  * information, see AttributesToGet in the Amazon DynamoDB Developer
  * Guide.
  */
  AttributesToGet?: Array<string>;
  /**
  * Determines the read consistency model: If set to true, then the operation
  * uses strongly consistent reads; otherwise, the operation uses eventually consistent
  * reads.
  */
  ConsistentRead?: boolean;
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
  /**
  * A string that identifies one or more attributes to retrieve from the table. These
  * attributes can include scalars, sets, or elements of a JSON document. The attributes in
  * the expression must be separated by commas.
  * If no attribute names are specified, then all attributes are returned. If any of the
  * requested attributes are not found, they do not appear in the result.
  * For more information, see Specifying Item Attributes in the Amazon DynamoDB Developer
  * Guide.
  */
  ProjectionExpression?: string;
  /**
  * One or more substitution tokens for attribute names in an expression. The following
  * are some use cases for using ExpressionAttributeNames:
  * To access an attribute whose name conflicts with a DynamoDB reserved
  * word.
  * To create a placeholder for repeating occurrences of an attribute name in an
  * expression.
  * To prevent special characters in an attribute name from being misinterpreted
  * in an expression.
  * Use the # character in an expression to dereference
  * an attribute name. For example, consider the following attribute name:
  * Percentile
  * The name of this attribute conflicts with a reserved word, so it cannot be used
  * directly in an expression. (For the complete list of reserved words, see Reserved Words in the Amazon DynamoDB Developer
  * Guide). To work around this, you could specify the following for
  * ExpressionAttributeNames:
  * {"#P":"Percentile"}
  * You could then use this substitution in an expression, as in this example:
  * #P = :val
  * Tokens that begin with the : character are
  * expression attribute values, which are placeholders for the
  * actual value at runtime.
  * For more information on expression attribute names, see Specifying Item Attributes in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeNames?: Record<string, string>;
}
/**
 * Represents the output of a GetItem operation.
 */
export interface GetItemOutput {
  /**
  * A map of attribute names to AttributeValue objects, as specified by
  * ProjectionExpression.
  */
  Item?: Record<string, AttributeValue>;
  /**
  * The capacity units consumed by the GetItem operation. The data returned
  * includes the total provisioned throughput consumed, along with statistics for the table
  * and any indexes involved in the operation. ConsumedCapacity is only
  * returned if the ReturnConsumedCapacity parameter was specified. For more
  * information, see Capacity unit consumption for read operations in the Amazon
  * DynamoDB Developer Guide.
  */
  ConsumedCapacity?: ConsumedCapacity;
}

export interface GetResourcePolicyInput {
  /**
  * The Amazon Resource Name (ARN) of the DynamoDB resource to which the policy is attached. The
  * resources you can specify include tables and streams.
  */
  ResourceArn: string;
}
export interface GetResourcePolicyOutput {
  /**
  * The resource-based policy document attached to the resource, which can be a table or
  * stream, in JSON format.
  */
  Policy?: string;
  /**
  * A unique string that represents the revision ID of the policy. If you're comparing revision IDs, make sure to always use string comparison logic.
  */
  RevisionId?: string;
}
/**
 * Represents the properties of a global secondary index.
 */
export interface GlobalSecondaryIndex {
  /**
  * The name of the global secondary index. The name must be unique among all other
  * indexes on this table.
  */
  IndexName: string;
  /**
  * The complete key schema for a global secondary index, which consists of one or more
  * pairs of attribute names and key types:
  * HASH - partition key
  * RANGE - sort key
  * The partition key of an item is also known as its hash
  * attribute. The term "hash attribute" derives from DynamoDB's usage of
  * an internal hash function to evenly distribute data items across partitions, based
  * on their partition key values.
  * The sort key of an item is also known as its range attribute.
  * The term "range attribute" derives from the way DynamoDB stores items with the same
  * partition key physically close together, in sorted order by the sort key
  * value.
  */
  KeySchema: Array<KeySchemaElement>;
  /**
  * Represents attributes that are copied (projected) from the table into the global
  * secondary index. These are in addition to the primary key attributes and index key
  * attributes, which are automatically projected.
  */
  Projection: Projection;
  /**
  * Represents the provisioned throughput settings for the specified global secondary
  * index. You must use either OnDemandThroughput or
  * ProvisionedThroughput based on your table's capacity mode.
  * For current minimum and maximum provisioned throughput values, see Service,
  * Account, and Table Quotas in the Amazon DynamoDB Developer
  * Guide.
  */
  ProvisionedThroughput?: ProvisionedThroughput;
  /**
  * The maximum number of read and write units for the specified global secondary index.
  * If you use this parameter, you must specify MaxReadRequestUnits,
  * MaxWriteRequestUnits, or both. You must use either
  * OnDemandThroughput or ProvisionedThroughput based on your
  * table's capacity mode.
  */
  OnDemandThroughput?: OnDemandThroughput;
  /**
  * Represents the warm throughput value (in read units per second and write units per
  * second) for the specified secondary index. If you use this parameter, you must specify
  * ReadUnitsPerSecond, WriteUnitsPerSecond, or both.
  */
  WarmThroughput?: WarmThroughput;
}
/**
 * Represents the auto scaling settings of a global secondary index for a global table
 * that will be modified.
 */
export interface GlobalSecondaryIndexAutoScalingUpdate {
  /**
  * The name of the global secondary index.
  */
  IndexName?: string;
  ProvisionedWriteCapacityAutoScalingUpdate?: AutoScalingSettingsUpdate;
}
export type GlobalSecondaryIndexAutoScalingUpdateList = Array<GlobalSecondaryIndexAutoScalingUpdate>;
/**
 * Represents the properties of a global secondary index.
 */
export interface GlobalSecondaryIndexDescription {
  /**
  * The name of the global secondary index.
  */
  IndexName?: string;
  /**
  * The complete key schema for a global secondary index, which consists of one or more
  * pairs of attribute names and key types:
  * HASH - partition key
  * RANGE - sort key
  * The partition key of an item is also known as its hash
  * attribute. The term "hash attribute" derives from DynamoDB's usage of an internal hash function to evenly distribute data items across
  * partitions, based on their partition key values.
  * The sort key of an item is also known as its range attribute.
  * The term "range attribute" derives from the way DynamoDB stores items with
  * the same partition key physically close together, in sorted order by the sort key
  * value.
  */
  KeySchema?: Array<KeySchemaElement>;
  /**
  * Represents attributes that are copied (projected) from the table into the global
  * secondary index. These are in addition to the primary key attributes and index key
  * attributes, which are automatically projected.
  */
  Projection?: Projection;
  /**
  * The current state of the global secondary index:
  * CREATING - The index is being created.
  * UPDATING - The index is being updated.
  * DELETING - The index is being deleted.
  * ACTIVE - The index is ready for use.
  */
  IndexStatus?: IndexStatus;
  /**
  * Indicates whether the index is currently backfilling. Backfilling
  * is the process of reading items from the table and determining whether they can be added
  * to the index. (Not all items will qualify: For example, a partition key cannot have any
  * duplicate values.) If an item can be added to the index, DynamoDB will do so. After all
  * items have been processed, the backfilling operation is complete and
  * Backfilling is false.
  * You can delete an index that is being created during the Backfilling
  * phase when IndexStatus is set to CREATING and Backfilling is
  * true. You can't delete the index that is being created when IndexStatus is
  * set to CREATING and Backfilling is false. 
  * For indexes that were created during a CreateTable operation, the
  * Backfilling attribute does not appear in the
  * DescribeTable output.
  */
  Backfilling?: boolean;
  /**
  * Represents the provisioned throughput settings for the specified global secondary
  * index.
  * For current minimum and maximum provisioned throughput values, see Service,
  * Account, and Table Quotas in the Amazon DynamoDB Developer
  * Guide.
  */
  ProvisionedThroughput?: ProvisionedThroughputDescription;
  /**
  * The total size of the specified index, in bytes. DynamoDB updates this value
  * approximately every six hours. Recent changes might not be reflected in this
  * value.
  */
  IndexSizeBytes?: number;
  /**
  * The number of items in the specified index. DynamoDB updates this value approximately
  * every six hours. Recent changes might not be reflected in this value.
  */
  ItemCount?: number;
  /**
  * The Amazon Resource Name (ARN) that uniquely identifies the index.
  */
  IndexArn?: string;
  /**
  * The maximum number of read and write units for the specified global secondary index.
  * If you use this parameter, you must specify MaxReadRequestUnits,
  * MaxWriteRequestUnits, or both.
  */
  OnDemandThroughput?: OnDemandThroughput;
  /**
  * Represents the warm throughput value (in read units per second and write units per
  * second) for the specified secondary index.
  */
  WarmThroughput?: GlobalSecondaryIndexWarmThroughputDescription;
}
export type GlobalSecondaryIndexDescriptionList = Array<GlobalSecondaryIndexDescription>;
export type GlobalSecondaryIndexes = Array<GlobalSecondaryIndexInfo>;
/**
 * Represents the properties of a global secondary index for the table when the backup
 * was created.
 */
export interface GlobalSecondaryIndexInfo {
  /**
  * The name of the global secondary index.
  */
  IndexName?: string;
  /**
  * The complete key schema for a global secondary index, which consists of one or more
  * pairs of attribute names and key types:
  * HASH - partition key
  * RANGE - sort key
  * The partition key of an item is also known as its hash
  * attribute. The term "hash attribute" derives from DynamoDB's usage of an internal hash function to evenly distribute data items across
  * partitions, based on their partition key values.
  * The sort key of an item is also known as its range attribute.
  * The term "range attribute" derives from the way DynamoDB stores items with
  * the same partition key physically close together, in sorted order by the sort key
  * value.
  */
  KeySchema?: Array<KeySchemaElement>;
  /**
  * Represents attributes that are copied (projected) from the table into the global
  * secondary index. These are in addition to the primary key attributes and index key
  * attributes, which are automatically projected.
  */
  Projection?: Projection;
  /**
  * Represents the provisioned throughput settings for the specified global secondary
  * index.
  */
  ProvisionedThroughput?: ProvisionedThroughput;
  OnDemandThroughput?: OnDemandThroughput;
}
export type GlobalSecondaryIndexList = Array<GlobalSecondaryIndex>;
/**
 * Represents one of the following:
 * A new global secondary index to be added to an existing table.
 * New provisioned throughput parameters for an existing global secondary
 * index.
 * An existing global secondary index to be removed from an existing
 * table.
 */
export interface GlobalSecondaryIndexUpdate {
  /**
  * The name of an existing global secondary index, along with new provisioned throughput
  * settings to be applied to that index.
  */
  Update?: UpdateGlobalSecondaryIndexAction;
  /**
  * The parameters required for creating a global secondary index on an existing
  * table:
  * IndexName 
  * KeySchema 
  * AttributeDefinitions 
  * Projection 
  * ProvisionedThroughput
  */
  Create?: CreateGlobalSecondaryIndexAction;
  /**
  * The name of an existing global secondary index to be removed.
  */
  Delete?: DeleteGlobalSecondaryIndexAction;
}
export type GlobalSecondaryIndexUpdateList = Array<GlobalSecondaryIndexUpdate>;
/**
 * The description of the warm throughput value on a global secondary index.
 */
export interface GlobalSecondaryIndexWarmThroughputDescription {
  /**
  * Represents warm throughput read units per second value for a global secondary
  * index.
  */
  ReadUnitsPerSecond?: number;
  /**
  * Represents warm throughput write units per second value for a global secondary
  * index.
  */
  WriteUnitsPerSecond?: number;
  /**
  * Represents the warm throughput status being created or updated on a global secondary
  * index. The status can only be UPDATING or ACTIVE.
  */
  Status?: IndexStatus;
}
/**
 * Represents the properties of a global table.
 */
export interface GlobalTable {
  /**
  * The global table name.
  */
  GlobalTableName?: string;
  /**
  * The Regions where the global table has replicas.
  */
  ReplicationGroup?: Array<Replica>;
}
/**
 * The specified global table already exists.
 */
export declare class GlobalTableAlreadyExistsException extends EffectData.TaggedError(
  "GlobalTableAlreadyExistsException",
)<{
  readonly message?: string;
}> {}
export type GlobalTableArnString = string;
/**
 * Contains details about the global table.
 */
export interface GlobalTableDescription {
  /**
  * The Regions where the global table has replicas.
  */
  ReplicationGroup?: Array<ReplicaDescription>;
  /**
  * The unique identifier of the global table.
  */
  GlobalTableArn?: string;
  /**
  * The creation time of the global table.
  */
  CreationDateTime?: Date | string;
  /**
  * The current state of the global table:
  * CREATING - The global table is being created.
  * UPDATING - The global table is being updated.
  * DELETING - The global table is being deleted.
  * ACTIVE - The global table is ready for use.
  */
  GlobalTableStatus?: GlobalTableStatus;
  /**
  * The global table name.
  */
  GlobalTableName?: string;
}
/**
 * Represents the settings of a global secondary index for a global table that will be
 * modified.
 */
export interface GlobalTableGlobalSecondaryIndexSettingsUpdate {
  /**
  * The name of the global secondary index. The name must be unique among all other
  * indexes on this table.
  */
  IndexName: string;
  /**
  * The maximum number of writes consumed per second before DynamoDB returns a
  * ThrottlingException.
  */
  ProvisionedWriteCapacityUnits?: number;
  /**
  * Auto scaling settings for managing a global secondary index's write capacity
  * units.
  */
  ProvisionedWriteCapacityAutoScalingSettingsUpdate?: AutoScalingSettingsUpdate;
}
export type GlobalTableGlobalSecondaryIndexSettingsUpdateList = Array<GlobalTableGlobalSecondaryIndexSettingsUpdate>;
export type GlobalTableList = Array<GlobalTable>;
/**
 * The specified global table does not exist.
 */
export declare class GlobalTableNotFoundException extends EffectData.TaggedError(
  "GlobalTableNotFoundException",
)<{
  readonly message?: string;
}> {}
export type GlobalTableStatus = "CREATING" | "ACTIVE" | "DELETING" | "UPDATING";
/**
 * Represents the properties of a witness Region in a MRSC global table.
 */
export interface GlobalTableWitnessDescription {
  /**
  * The name of the Amazon Web Services Region that serves as a witness for the MRSC global
  * table.
  */
  RegionName?: string;
  /**
  * The current status of the witness Region in the MRSC global table.
  */
  WitnessStatus?: WitnessStatus;
}
export type GlobalTableWitnessDescriptionList = Array<GlobalTableWitnessDescription>;
/**
 * Represents one of the following:
 * A new witness to be added to a new global table.
 * An existing witness to be removed from an existing global table.
 * You can configure one witness per MRSC global table.
 */
export interface GlobalTableWitnessGroupUpdate {
  /**
  * Specifies a witness Region to be added to a new MRSC global table. The witness must be
  * added when creating the MRSC global table.
  */
  Create?: CreateGlobalTableWitnessGroupMemberAction;
  /**
  * Specifies a witness Region to be removed from an existing global table. Must be done
  * in conjunction with removing a replica. The deletion of both a witness and replica
  * converts the remaining replica to a single-Region DynamoDB table.
  */
  Delete?: DeleteGlobalTableWitnessGroupMemberAction;
}
export type GlobalTableWitnessGroupUpdateList = Array<GlobalTableWitnessGroupUpdate>;
/**
 * DynamoDB rejected the request because you retried a request with a
 * different payload but with an idempotent token that was already used.
 */
export declare class IdempotentParameterMismatchException extends EffectData.TaggedError(
  "IdempotentParameterMismatchException",
)<{
  readonly Message?: string;
}> {}
export type ImportArn = string;
/**
 * There was a conflict when importing from the specified S3 source. This can occur when
 * the current import conflicts with a previous import request that had the same client
 * token.
 */
export declare class ImportConflictException extends EffectData.TaggedError(
  "ImportConflictException",
)<{
  readonly message?: string;
}> {}
export type ImportedItemCount = number;
export type ImportEndTime = Date | string;
export type ImportNextToken = string;
/**
 * The specified import was not found.
 */
export declare class ImportNotFoundException extends EffectData.TaggedError(
  "ImportNotFoundException",
)<{
  readonly message?: string;
}> {}
export type ImportStartTime = Date | string;
export type ImportStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELLING" | "CANCELLED" | "FAILED";
/**
 * Summary information about the source file for the import.
 */
export interface ImportSummary {
  /**
  * The Amazon Resource Number (ARN) corresponding to the import request.
  */
  ImportArn?: string;
  /**
  * The status of the import operation.
  */
  ImportStatus?: ImportStatus;
  /**
  * The Amazon Resource Number (ARN) of the table being imported into.
  */
  TableArn?: string;
  /**
  * The path and S3 bucket of the source file that is being imported. This includes the
  * S3Bucket (required), S3KeyPrefix (optional) and S3BucketOwner (optional if the bucket is
  * owned by the requester).
  */
  S3BucketSource?: S3BucketSource;
  /**
  * The Amazon Resource Number (ARN) of the Cloudwatch Log Group associated with this
  * import task.
  */
  CloudWatchLogGroupArn?: string;
  /**
  * The format of the source data. Valid values are CSV,
  * DYNAMODB_JSON or ION.
  */
  InputFormat?: InputFormat;
  /**
  * The time at which this import task began.
  */
  StartTime?: Date | string;
  /**
  * The time at which this import task ended. (Does this include the successful complete
  * creation of the table it was imported to?)
  */
  EndTime?: Date | string;
}
export type ImportSummaryList = Array<ImportSummary>;

/**
 * Represents the properties of the table being imported into.
 */
export interface ImportTableDescription {
  /**
  * The Amazon Resource Number (ARN) corresponding to the import request.
  */
  ImportArn?: string;
  /**
  * The status of the import.
  */
  ImportStatus?: ImportStatus;
  /**
  * The Amazon Resource Number (ARN) of the table being imported into.
  */
  TableArn?: string;
  /**
  * The table id corresponding to the table created by import table process.
  */
  TableId?: string;
  /**
  * The client token that was provided for the import task. Reusing the client token on
  * retry makes a call to ImportTable idempotent.
  */
  ClientToken?: string;
  /**
  * Values for the S3 bucket the source file is imported from. Includes bucket name
  * (required), key prefix (optional) and bucket account owner ID (optional).
  */
  S3BucketSource?: S3BucketSource;
  /**
  * The number of errors occurred on importing the source file into the target table.
  */
  ErrorCount?: number;
  /**
  * The Amazon Resource Number (ARN) of the Cloudwatch Log Group associated with the
  * target table.
  */
  CloudWatchLogGroupArn?: string;
  /**
  * The format of the source data going into the target table.
  */
  InputFormat?: InputFormat;
  /**
  * The format options for the data that was imported into the target table. There is one
  * value, CsvOption.
  */
  InputFormatOptions?: InputFormatOptions;
  /**
  * The compression options for the data that has been imported into the target table.
  * The values are NONE, GZIP, or ZSTD.
  */
  InputCompressionType?: InputCompressionType;
  /**
  * The parameters for the new table that is being imported into.
  */
  TableCreationParameters?: TableCreationParameters;
  /**
  * The time when this import task started.
  */
  StartTime?: Date | string;
  /**
  * The time at which the creation of the table associated with this import task
  * completed.
  */
  EndTime?: Date | string;
  /**
  * The total size of data processed from the source file, in Bytes.
  */
  ProcessedSizeBytes?: number;
  /**
  * The total number of items processed from the source file.
  */
  ProcessedItemCount?: number;
  /**
  * The number of items successfully imported into the new table.
  */
  ImportedItemCount?: number;
  /**
  * The error code corresponding to the failure that the import job ran into during
  * execution.
  */
  FailureCode?: string;
  /**
  * The error message corresponding to the failure that the import job ran into during
  * execution.
  */
  FailureMessage?: string;
}
export interface ImportTableInput {
  /**
  * Providing a ClientToken makes the call to ImportTableInput
  * idempotent, meaning that multiple identical calls have the same effect as one single
  * call.
  * A client token is valid for 8 hours after the first request that uses it is completed.
  * After 8 hours, any request with the same client token is treated as a new request. Do
  * not resubmit the same request with the same client token for more than 8 hours, or the
  * result might not be idempotent.
  * If you submit a request with the same client token but a change in other parameters
  * within the 8-hour idempotency window, DynamoDB returns an
  * IdempotentParameterMismatch exception.
  */
  ClientToken?: string;
  /**
  * The S3 bucket that provides the source for the import.
  */
  S3BucketSource: S3BucketSource;
  /**
  * The format of the source data. Valid values for ImportFormat are
  * CSV, DYNAMODB_JSON or ION.
  */
  InputFormat: InputFormat;
  /**
  * Additional properties that specify how the input is formatted,
  */
  InputFormatOptions?: InputFormatOptions;
  /**
  * Type of compression to be used on the input coming from the imported table.
  */
  InputCompressionType?: InputCompressionType;
  /**
  * Parameters for the table to import the data into.
  */
  TableCreationParameters: TableCreationParameters;
}
export interface ImportTableOutput {
  /**
  * Represents the properties of the table created for the import, and parameters of the
  * import. The import parameters include import status, how many items were processed, and
  * how many errors were encountered.
  */
  ImportTableDescription: ImportTableDescription;
}
/**
 * Optional object containing the parameters specific to an incremental export.
 */
export interface IncrementalExportSpecification {
  /**
  * Time in the past which provides the inclusive start range for the export table's data,
  * counted in seconds from the start of the Unix epoch. The incremental export will reflect
  * the table's state including and after this point in time.
  */
  ExportFromTime?: Date | string;
  /**
  * Time in the past which provides the exclusive end range for the export table's data,
  * counted in seconds from the start of the Unix epoch. The incremental export will reflect
  * the table's state just prior to this point in time. If this is not provided, the latest
  * time with data available will be used.
  */
  ExportToTime?: Date | string;
  /**
  * The view type that was chosen for the export. Valid values are
  * NEW_AND_OLD_IMAGES and NEW_IMAGES. The default value is
  * NEW_AND_OLD_IMAGES.
  */
  ExportViewType?: ExportViewType;
}
export type IndexName = string;
/**
 * The operation tried to access a nonexistent index.
 */
export declare class IndexNotFoundException extends EffectData.TaggedError(
  "IndexNotFoundException",
)<{
  readonly message?: string;
}> {}
export type IndexStatus = "CREATING" | "UPDATING" | "DELETING" | "ACTIVE";
export type InputCompressionType = "GZIP" | "ZSTD" | "NONE";
export type InputFormat = "DYNAMODB_JSON" | "ION" | "CSV";
/**
 * The format options for the data that was imported into the target table. There is one
 * value, CsvOption.
 */
export interface InputFormatOptions {
  /**
  * The options for imported source files in CSV format. The values are Delimiter and
  * HeaderList.
  */
  Csv?: CsvOptions;
}
export type Integer = number;
export type IntegerObject = number;
/**
 * An error occurred on the server side.
 */
export declare class InternalServerError extends EffectData.TaggedError(
  "InternalServerError",
)<{
    /**
   * The server encountered an internal error trying to fulfill the request.
   */
  readonly message?: string;
}> {}
export declare class InvalidEndpointException extends EffectData.TaggedError(
  "InvalidEndpointException",
)<{
  readonly Message?: string;
}> {}
/**
 * The specified ExportTime is outside of the point in time recovery
 * window.
 */
export declare class InvalidExportTimeException extends EffectData.TaggedError(
  "InvalidExportTimeException",
)<{
  readonly message?: string;
}> {}
/**
 * An invalid restore time was specified. RestoreDateTime must be between
 * EarliestRestorableDateTime and LatestRestorableDateTime.
 */
export declare class InvalidRestoreTimeException extends EffectData.TaggedError(
  "InvalidRestoreTimeException",
)<{
  readonly message?: string;
}> {}
export type ItemCollectionKeyAttributeMap = Record<string, AttributeValue>
/**
 * Information about item collections, if any, that were affected by the operation.
 * ItemCollectionMetrics is only returned if the request asked for it. If
 * the table does not have any local secondary indexes, this information is not returned in
 * the response.
 */
export interface ItemCollectionMetrics {
  /**
  * The partition key value of the item collection. This value is the same as the
  * partition key value of the item.
  */
  ItemCollectionKey?: Record<string, AttributeValue>;
  /**
  * An estimate of item collection size, in gigabytes. This value is a two-element array
  * containing a lower bound and an upper bound for the estimate. The estimate includes the
  * size of all the items in the table, plus the size of all attributes projected into all
  * of the local secondary indexes on that table. Use this estimate to measure whether a
  * local secondary index is approaching its size limit.
  * The estimate is subject to change over time; therefore, do not rely on the precision
  * or accuracy of the estimate.
  */
  SizeEstimateRangeGB?: Array<number>;
}
export type ItemCollectionMetricsMultiple = Array<ItemCollectionMetrics>;
export type ItemCollectionMetricsPerTable = Record<string, Array<ItemCollectionMetrics>>
export type ItemCollectionSizeEstimateBound = number;
export type ItemCollectionSizeEstimateRange = Array<number>;
/**
 * An item collection is too large. This exception is only returned for tables that
 * have one or more local secondary indexes.
 */
export declare class ItemCollectionSizeLimitExceededException extends EffectData.TaggedError(
  "ItemCollectionSizeLimitExceededException",
)<{
    /**
   * The total size of an item collection has exceeded the maximum limit of 10
   * gigabytes.
   */
  readonly message?: string;
}> {}
export type ItemCount = number;
export type ItemList = Array<Record<string, AttributeValue>>;
/**
 * Details for the requested item.
 */
export interface ItemResponse {
  /**
  * Map of attribute data consisting of the data type and attribute value.
  */
  Item?: Record<string, AttributeValue>;
}
export type ItemResponseList = Array<ItemResponse>;
export type Key = Record<string, AttributeValue>
export type KeyConditions = Record<string, Condition>
export type KeyExpression = string;
export type KeyList = Array<Record<string, AttributeValue>>;
/**
 * Represents a set of primary keys and, for each key, the attributes to retrieve from
 * the table.
 * For each primary key, you must provide all of the key attributes.
 * For example, with a simple primary key, you only need to provide the partition key. For
 * a composite primary key, you must provide both the partition key
 * and the sort key.
 */
export interface KeysAndAttributes {
  /**
  * The primary key attribute values that define the items and the attributes associated
  * with the items.
  */
  Keys: Array<Record<string, AttributeValue>>;
  /**
  * This is a legacy parameter. Use ProjectionExpression instead. For more
  * information, see Legacy
  * Conditional Parameters in the Amazon DynamoDB Developer
  * Guide.
  */
  AttributesToGet?: Array<string>;
  /**
  * The consistency of a read operation. If set to true, then a strongly
  * consistent read is used; otherwise, an eventually consistent read is used.
  */
  ConsistentRead?: boolean;
  /**
  * A string that identifies one or more attributes to retrieve from the table. These
  * attributes can include scalars, sets, or elements of a JSON document. The attributes in
  * the ProjectionExpression must be separated by commas.
  * If no attribute names are specified, then all attributes will be returned. If any of
  * the requested attributes are not found, they will not appear in the result.
  * For more information, see Accessing Item Attributes in the Amazon DynamoDB Developer
  * Guide.
  */
  ProjectionExpression?: string;
  /**
  * One or more substitution tokens for attribute names in an expression. The following
  * are some use cases for using ExpressionAttributeNames:
  * To access an attribute whose name conflicts with a DynamoDB reserved
  * word.
  * To create a placeholder for repeating occurrences of an attribute name in an
  * expression.
  * To prevent special characters in an attribute name from being misinterpreted
  * in an expression.
  * Use the # character in an expression to dereference
  * an attribute name. For example, consider the following attribute name:
  * Percentile
  * The name of this attribute conflicts with a reserved word, so it cannot be used
  * directly in an expression. (For the complete list of reserved words, see Reserved Words in the Amazon DynamoDB Developer
  * Guide). To work around this, you could specify the following for
  * ExpressionAttributeNames:
  * {"#P":"Percentile"}
  * You could then use this substitution in an expression, as in this example:
  * #P = :val
  * Tokens that begin with the : character are
  * expression attribute values, which are placeholders for the
  * actual value at runtime.
  * For more information on expression attribute names, see Accessing Item Attributes in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeNames?: Record<string, string>;
}
export type KeySchema = Array<KeySchemaElement>;
export type KeySchemaAttributeName = string;
/**
 * Represents a single element of a key schema. A key schema
 * specifies the attributes that make up the primary key of a table, or the key attributes
 * of an index.
 * A KeySchemaElement represents exactly one attribute of the primary key.
 * For example, a simple primary key would be represented by one
 * KeySchemaElement (for the partition key). A composite primary key would
 * require one KeySchemaElement for the partition key, and another
 * KeySchemaElement for the sort key.
 * A KeySchemaElement must be a scalar, top-level attribute (not a nested
 * attribute). The data type must be one of String, Number, or Binary. The attribute cannot
 * be nested within a List or a Map.
 */
export interface KeySchemaElement {
  /**
  * The name of a key attribute.
  */
  AttributeName: string;
  /**
  * The role that this key attribute will assume:
  * HASH - partition key
  * RANGE - sort key
  * The partition key of an item is also known as its hash
  * attribute. The term "hash attribute" derives from DynamoDB's usage of an internal hash function to evenly distribute data items across
  * partitions, based on their partition key values.
  * The sort key of an item is also known as its range attribute.
  * The term "range attribute" derives from the way DynamoDB stores items with
  * the same partition key physically close together, in sorted order by the sort key
  * value.
  */
  KeyType: KeyType;
}
export type KeyType = "HASH" | "RANGE";
/**
 * Describes a Kinesis data stream destination.
 */
export interface KinesisDataStreamDestination {
  /**
  * The ARN for a specific Kinesis data stream.
  */
  StreamArn?: string;
  /**
  * The current status of replication.
  */
  DestinationStatus?: DestinationStatus;
  /**
  * The human-readable string that corresponds to the replica status.
  */
  DestinationStatusDescription?: string;
  /**
  * The precision of the Kinesis data stream timestamp. The values are either
  * MILLISECOND or MICROSECOND.
  */
  ApproximateCreationDateTimePrecision?: ApproximateCreationDateTimePrecision;
}
export type KinesisDataStreamDestinations = Array<KinesisDataStreamDestination>;
export interface KinesisStreamingDestinationInput {
  /**
  * The name of the DynamoDB table. You can also provide the Amazon Resource Name (ARN) of the
  * table in this parameter.
  */
  TableName: string;
  /**
  * The ARN for a Kinesis data stream.
  */
  StreamArn: string;
  /**
  * The source for the Kinesis streaming information that is being enabled.
  */
  EnableKinesisStreamingConfiguration?: EnableKinesisStreamingConfiguration;
}
export interface KinesisStreamingDestinationOutput {
  /**
  * The name of the table being modified.
  */
  TableName?: string;
  /**
  * The ARN for the specific Kinesis data stream.
  */
  StreamArn?: string;
  /**
  * The current status of the replication.
  */
  DestinationStatus?: DestinationStatus;
  /**
  * The destination for the Kinesis streaming information that is being enabled.
  */
  EnableKinesisStreamingConfiguration?: EnableKinesisStreamingConfiguration;
}
export type KMSMasterKeyArn = string;
export type KMSMasterKeyId = string;
export type LastUpdateDateTime = Date | string;
/**
 * There is no limit to the number of daily on-demand backups that can be taken. 
 * For most purposes, up to 500 simultaneous table operations are allowed per account.
 * These operations include CreateTable, UpdateTable,
 * DeleteTable,UpdateTimeToLive,
 * RestoreTableFromBackup, and RestoreTableToPointInTime. 
 * When you are creating a table with one or more secondary indexes, you can have up
 * to 250 such requests running at a time. However, if the table or index specifications
 * are complex, then DynamoDB might temporarily reduce the number of concurrent
 * operations.
 * When importing into DynamoDB, up to 50 simultaneous import table operations are
 * allowed per account.
 * There is a soft account quota of 2,500 tables.
 * GetRecords was called with a value of more than 1000 for the limit request
 * parameter.
 * More than 2 processes are reading from the same streams shard at the same time.
 * Exceeding this limit may result in request throttling.
 */
export declare class LimitExceededException extends EffectData.TaggedError(
  "LimitExceededException",
)<{
    /**
   * Too many operations for a given subscriber.
   */
  readonly message?: string;
}> {}
export type ListAttributeValue = Array<AttributeValue>;

export interface ListBackupsInput {
  /**
  * Lists the backups from the table specified in TableName. You can also
  * provide the Amazon Resource Name (ARN) of the table in this parameter.
  */
  TableName?: string;
  /**
  * Maximum number of backups to return at once.
  */
  Limit?: number;
  /**
  * Only backups created after this time are listed. TimeRangeLowerBound is
  * inclusive.
  */
  TimeRangeLowerBound?: Date | string;
  /**
  * Only backups created before this time are listed. TimeRangeUpperBound is
  * exclusive.
  */
  TimeRangeUpperBound?: Date | string;
  /**
  * LastEvaluatedBackupArn is the Amazon Resource Name (ARN) of the backup last
  * evaluated when the current page of results was returned, inclusive of the current page
  * of results. This value may be specified as the ExclusiveStartBackupArn of a
  * new ListBackups operation in order to fetch the next page of results.
  */
  ExclusiveStartBackupArn?: string;
  /**
  * The backups from the table specified by BackupType are listed.
  * Where BackupType can be:
  * USER - On-demand backup created by you. (The default setting if no
  * other backup types are specified.)
  * SYSTEM - On-demand backup automatically created by DynamoDB.
  * ALL - All types of on-demand backups (USER and SYSTEM).
  */
  BackupType?: BackupTypeFilter;
}
export interface ListBackupsOutput {
  /**
  * List of BackupSummary objects.
  */
  BackupSummaries?: Array<BackupSummary>;
  /**
  * The ARN of the backup last evaluated when the current page of results was returned,
  * inclusive of the current page of results. This value may be specified as the
  * ExclusiveStartBackupArn of a new ListBackups operation in
  * order to fetch the next page of results. 
  * If LastEvaluatedBackupArn is empty, then the last page of results has
  * been processed and there are no more results to be retrieved. 
  * If LastEvaluatedBackupArn is not empty, this may or may not indicate
  * that there is more data to be returned. All results are guaranteed to have been returned
  * if and only if no value for LastEvaluatedBackupArn is returned.
  */
  LastEvaluatedBackupArn?: string;
}

export interface ListContributorInsightsInput {
  /**
  * The name of the table. You can also provide the Amazon Resource Name (ARN) of the table in this
  * parameter.
  */
  TableName?: string;
  /**
  * A token to for the desired page, if there is one.
  */
  NextToken?: string;
  /**
  * Maximum number of results to return per page.
  */
  MaxResults?: number;
}
export type ListContributorInsightsLimit = number;
export interface ListContributorInsightsOutput {
  /**
  * A list of ContributorInsightsSummary.
  */
  ContributorInsightsSummaries?: Array<ContributorInsightsSummary>;
  /**
  * A token to go to the next page if there is one.
  */
  NextToken?: string;
}

export interface ListExportsInput {
  /**
  * The Amazon Resource Name (ARN) associated with the exported table.
  */
  TableArn?: string;
  /**
  * Maximum number of results to return per page.
  */
  MaxResults?: number;
  /**
  * An optional string that, if supplied, must be copied from the output of a previous
  * call to ListExports. When provided in this manner, the API fetches the next
  * page of results.
  */
  NextToken?: string;
}
export type ListExportsMaxLimit = number;
export interface ListExportsOutput {
  /**
  * A list of ExportSummary objects.
  */
  ExportSummaries?: Array<ExportSummary>;
  /**
  * If this value is returned, there are additional results to be displayed. To retrieve
  * them, call ListExports again, with NextToken set to this
  * value.
  */
  NextToken?: string;
}

export interface ListGlobalTablesInput {
  /**
  * The first global table name that this operation will evaluate.
  */
  ExclusiveStartGlobalTableName?: string;
  /**
  * The maximum number of table names to return, if the parameter is not specified
  * DynamoDB defaults to 100.
  * If the number of global tables DynamoDB finds reaches this limit, it stops the
  * operation and returns the table names collected up to that point, with a table name in
  * the LastEvaluatedGlobalTableName to apply in a subsequent operation to the
  * ExclusiveStartGlobalTableName parameter.
  */
  Limit?: number;
  /**
  * Lists the global tables in a specific Region.
  */
  RegionName?: string;
}
export interface ListGlobalTablesOutput {
  /**
  * List of global table names.
  */
  GlobalTables?: Array<GlobalTable>;
  /**
  * Last evaluated global table name.
  */
  LastEvaluatedGlobalTableName?: string;
}

export interface ListImportsInput {
  /**
  * The Amazon Resource Name (ARN) associated with the table that was imported to.
  */
  TableArn?: string;
  /**
  * The number of ImportSummary objects returned in a single page.
  */
  PageSize?: number;
  /**
  * An optional string that, if supplied, must be copied from the output of a previous
  * call to ListImports. When provided in this manner, the API fetches the next
  * page of results.
  */
  NextToken?: string;
}
export type ListImportsMaxLimit = number;
export interface ListImportsOutput {
  /**
  * A list of ImportSummary objects.
  */
  ImportSummaryList?: Array<ImportSummary>;
  /**
  * If this value is returned, there are additional results to be displayed. To retrieve
  * them, call ListImports again, with NextToken set to this
  * value.
  */
  NextToken?: string;
}

/**
 * Represents the input of a ListTables operation.
 */
export interface ListTablesInput {
  /**
  * The first table name that this operation will evaluate. Use the value that was
  * returned for LastEvaluatedTableName in a previous operation, so that you
  * can obtain the next page of results.
  */
  ExclusiveStartTableName?: string;
  /**
  * A maximum number of table names to return. If this parameter is not specified, the
  * limit is 100.
  */
  Limit?: number;
}
export type ListTablesInputLimit = number;
/**
 * Represents the output of a ListTables operation.
 */
export interface ListTablesOutput {
  /**
  * The names of the tables associated with the current account at the current endpoint.
  * The maximum size of this array is 100.
  * If LastEvaluatedTableName also appears in the output, you can use this
  * value as the ExclusiveStartTableName parameter in a subsequent
  * ListTables request and obtain the next page of results.
  */
  TableNames?: Array<string>;
  /**
  * The name of the last table in the current page of results. Use this value as the
  * ExclusiveStartTableName in a new request to obtain the next page of
  * results, until all the table names are returned.
  * If you do not receive a LastEvaluatedTableName value in the response,
  * this means that there are no more table names to be retrieved.
  */
  LastEvaluatedTableName?: string;
}

export interface ListTagsOfResourceInput {
  /**
  * The Amazon DynamoDB resource with tags to be listed. This value is an Amazon Resource
  * Name (ARN).
  */
  ResourceArn: string;
  /**
  * An optional string that, if supplied, must be copied from the output of a previous
  * call to ListTagOfResource. When provided in this manner, this API fetches the next page
  * of results.
  */
  NextToken?: string;
}
export interface ListTagsOfResourceOutput {
  /**
  * The tags currently associated with the Amazon DynamoDB resource.
  */
  Tags?: Array<Tag>;
  /**
  * If this value is returned, there are additional results to be displayed. To retrieve
  * them, call ListTagsOfResource again, with NextToken set to this value.
  */
  NextToken?: string;
}
/**
 * Represents the properties of a local secondary index.
 */
export interface LocalSecondaryIndex {
  /**
  * The name of the local secondary index. The name must be unique among all other indexes
  * on this table.
  */
  IndexName: string;
  /**
  * The complete key schema for the local secondary index, consisting of one or more pairs
  * of attribute names and key types:
  * HASH - partition key
  * RANGE - sort key
  * The partition key of an item is also known as its hash
  * attribute. The term "hash attribute" derives from DynamoDB's usage of
  * an internal hash function to evenly distribute data items across partitions, based
  * on their partition key values.
  * The sort key of an item is also known as its range attribute.
  * The term "range attribute" derives from the way DynamoDB stores items with the same
  * partition key physically close together, in sorted order by the sort key
  * value.
  */
  KeySchema: Array<KeySchemaElement>;
  /**
  * Represents attributes that are copied (projected) from the table into the local
  * secondary index. These are in addition to the primary key attributes and index key
  * attributes, which are automatically projected.
  */
  Projection: Projection;
}
/**
 * Represents the properties of a local secondary index.
 */
export interface LocalSecondaryIndexDescription {
  /**
  * Represents the name of the local secondary index.
  */
  IndexName?: string;
  /**
  * The complete key schema for the local secondary index, consisting of one or more pairs
  * of attribute names and key types:
  * HASH - partition key
  * RANGE - sort key
  * The partition key of an item is also known as its hash
  * attribute. The term "hash attribute" derives from DynamoDB's usage of
  * an internal hash function to evenly distribute data items across partitions, based
  * on their partition key values.
  * The sort key of an item is also known as its range attribute.
  * The term "range attribute" derives from the way DynamoDB stores items with the same
  * partition key physically close together, in sorted order by the sort key
  * value.
  */
  KeySchema?: Array<KeySchemaElement>;
  /**
  * Represents attributes that are copied (projected) from the table into the global
  * secondary index. These are in addition to the primary key attributes and index key
  * attributes, which are automatically projected.
  */
  Projection?: Projection;
  /**
  * The total size of the specified index, in bytes. DynamoDB updates this value
  * approximately every six hours. Recent changes might not be reflected in this
  * value.
  */
  IndexSizeBytes?: number;
  /**
  * The number of items in the specified index. DynamoDB updates this value
  * approximately every six hours. Recent changes might not be reflected in this
  * value.
  */
  ItemCount?: number;
  /**
  * The Amazon Resource Name (ARN) that uniquely identifies the index.
  */
  IndexArn?: string;
}
export type LocalSecondaryIndexDescriptionList = Array<LocalSecondaryIndexDescription>;
export type LocalSecondaryIndexes = Array<LocalSecondaryIndexInfo>;
/**
 * Represents the properties of a local secondary index for the table when the backup was
 * created.
 */
export interface LocalSecondaryIndexInfo {
  /**
  * Represents the name of the local secondary index.
  */
  IndexName?: string;
  /**
  * The complete key schema for a local secondary index, which consists of one or more
  * pairs of attribute names and key types:
  * HASH - partition key
  * RANGE - sort key
  * The partition key of an item is also known as its hash
  * attribute. The term "hash attribute" derives from DynamoDB's usage of
  * an internal hash function to evenly distribute data items across partitions, based
  * on their partition key values.
  * The sort key of an item is also known as its range attribute.
  * The term "range attribute" derives from the way DynamoDB stores items with the same
  * partition key physically close together, in sorted order by the sort key
  * value.
  */
  KeySchema?: Array<KeySchemaElement>;
  /**
  * Represents attributes that are copied (projected) from the table into the global
  * secondary index. These are in addition to the primary key attributes and index key
  * attributes, which are automatically projected.
  */
  Projection?: Projection;
}
export type LocalSecondaryIndexList = Array<LocalSecondaryIndex>;
export type Long = number;
export type LongObject = number;
export type MapAttributeValue = Record<string, AttributeValue>
export type MultiRegionConsistency = "EVENTUAL" | "STRONG";
export type NextTokenString = string;
export type NonKeyAttributeName = string;
export type NonKeyAttributeNameList = Array<string>;
export type NonNegativeLongObject = number;
export type NullAttributeValue = boolean;
export type NumberAttributeValue = string;
export type NumberSetAttributeValue = Array<string>;
/**
 * Sets the maximum number of read and write units for the specified on-demand table. If
 * you use this parameter, you must specify MaxReadRequestUnits,
 * MaxWriteRequestUnits, or both.
 */
export interface OnDemandThroughput {
  /**
  * Maximum number of read request units for the specified table.
  * To specify a maximum OnDemandThroughput on your table, set the value of
  * MaxReadRequestUnits as greater than or equal to 1. To remove the
  * maximum OnDemandThroughput that is currently set on your table, set the
  * value of MaxReadRequestUnits to -1.
  */
  MaxReadRequestUnits?: number;
  /**
  * Maximum number of write request units for the specified table.
  * To specify a maximum OnDemandThroughput on your table, set the value of
  * MaxWriteRequestUnits as greater than or equal to 1. To remove the
  * maximum OnDemandThroughput that is currently set on your table, set the
  * value of MaxWriteRequestUnits to -1.
  */
  MaxWriteRequestUnits?: number;
}
/**
 * Overrides the on-demand throughput settings for this replica table. If you don't
 * specify a value for this parameter, it uses the source table's on-demand throughput
 * settings.
 */
export interface OnDemandThroughputOverride {
  /**
  * Maximum number of read request units for the specified replica table.
  */
  MaxReadRequestUnits?: number;
}
/**
 * Represents a PartiQL statement that uses parameters.
 */
export interface ParameterizedStatement {
  /**
  * A PartiQL statement that uses parameters.
  */
  Statement: string;
  /**
  * The parameter values.
  */
  Parameters?: Array<AttributeValue>;
  /**
  * An optional parameter that returns the item attributes for a PartiQL
  * ParameterizedStatement operation that failed a condition check.
  * There is no additional cost associated with requesting a return value aside from the
  * small network and processing overhead of receiving a larger response. No read capacity
  * units are consumed.
  */
  ReturnValuesOnConditionCheckFailure?: ReturnValuesOnConditionCheckFailure;
}
export type ParameterizedStatements = Array<ParameterizedStatement>;
export type PartiQLBatchRequest = Array<BatchStatementRequest>;
export type PartiQLBatchResponse = Array<BatchStatementResponse>;
export type PartiQLNextToken = string;
export type PartiQLStatement = string;
/**
 * The description of the point in time settings applied to the table.
 */
export interface PointInTimeRecoveryDescription {
  /**
  * The current state of point in time recovery:
  * ENABLED - Point in time recovery is enabled.
  * DISABLED - Point in time recovery is disabled.
  */
  PointInTimeRecoveryStatus?: PointInTimeRecoveryStatus;
  /**
  * The number of preceding days for which continuous backups are taken and maintained.
  * Your table data is only recoverable to any point-in-time from within the configured
  * recovery period. This parameter is optional.
  */
  RecoveryPeriodInDays?: number;
  /**
  * Specifies the earliest point in time you can restore your table to. You can restore
  * your table to any point in time during the last 35 days.
  */
  EarliestRestorableDateTime?: Date | string;
  /**
  * LatestRestorableDateTime is typically 5 minutes before the current time.
  */
  LatestRestorableDateTime?: Date | string;
}
/**
 * Represents the settings used to enable point in time recovery.
 */
export interface PointInTimeRecoverySpecification {
  /**
  * Indicates whether point in time recovery is enabled (true) or disabled (false) on the
  * table.
  */
  PointInTimeRecoveryEnabled: boolean;
  /**
  * The number of preceding days for which continuous backups are taken and maintained.
  * Your table data is only recoverable to any point-in-time from within the configured
  * recovery period. This parameter is optional. If no value is provided, the value will
  * default to 35.
  */
  RecoveryPeriodInDays?: number;
}
export type PointInTimeRecoveryStatus = "ENABLED" | "DISABLED";
/**
 * Point in time recovery has not yet been enabled for this source table.
 */
export declare class PointInTimeRecoveryUnavailableException extends EffectData.TaggedError(
  "PointInTimeRecoveryUnavailableException",
)<{
  readonly message?: string;
}> {}
/**
 * The operation tried to access a nonexistent resource-based policy.
 * If you specified an ExpectedRevisionId, it's possible that a policy is
 * present for the resource but its revision ID didn't match the expected value.
 */
export declare class PolicyNotFoundException extends EffectData.TaggedError(
  "PolicyNotFoundException",
)<{
  readonly message?: string;
}> {}
export type PolicyRevisionId = string;
export type PositiveIntegerObject = number;
export type PositiveLongObject = number;
export type PreparedStatementParameters = Array<AttributeValue>;
export type ProcessedItemCount = number;
/**
 * Represents attributes that are copied (projected) from the table into an index. These
 * are in addition to the primary key attributes and index key attributes, which are
 * automatically projected.
 */
export interface Projection {
  /**
  * The set of attributes that are projected into the index:
  * KEYS_ONLY - Only the index and primary keys are projected into the
  * index.
  * INCLUDE - In addition to the attributes described in
  * KEYS_ONLY, the secondary index will include other non-key
  * attributes that you specify.
  * ALL - All of the table attributes are projected into the
  * index.
  * When using the DynamoDB console, ALL is selected by default.
  */
  ProjectionType?: ProjectionType;
  /**
  * Represents the non-key attribute names which will be projected into the index.
  * For global and local secondary indexes, the total count of
  * NonKeyAttributes summed across all of the secondary indexes, must not
  * exceed 100. If you project the same attribute into two different indexes, this counts as
  * two distinct attributes when determining the total. This limit only applies when you
  * specify the ProjectionType of INCLUDE. You still can specify the
  * ProjectionType of ALL to project all attributes from the source table, even
  * if the table has more than 100 attributes.
  */
  NonKeyAttributes?: Array<string>;
}
export type ProjectionExpression = string;
export type ProjectionType = "ALL" | "KEYS_ONLY" | "INCLUDE";
/**
 * Represents the provisioned throughput settings for the specified global secondary
 * index. You must use ProvisionedThroughput or
 * OnDemandThroughput based on your table’s capacity mode.
 * For current minimum and maximum provisioned throughput values, see Service,
 * Account, and Table Quotas in the Amazon DynamoDB Developer
 * Guide.
 */
export interface ProvisionedThroughput {
  /**
  * The maximum number of strongly consistent reads consumed per second before DynamoDB
  * returns a ThrottlingException. For more information, see Specifying
  * Read and Write Requirements in the Amazon DynamoDB Developer
  * Guide.
  * If read/write capacity mode is PAY_PER_REQUEST the value is set to
  * 0.
  */
  ReadCapacityUnits: number;
  /**
  * The maximum number of writes consumed per second before DynamoDB returns a
  * ThrottlingException. For more information, see Specifying
  * Read and Write Requirements in the Amazon DynamoDB Developer
  * Guide.
  * If read/write capacity mode is PAY_PER_REQUEST the value is set to
  * 0.
  */
  WriteCapacityUnits: number;
}
/**
 * Represents the provisioned throughput settings for the table, consisting of read and
 * write capacity units, along with data about increases and decreases.
 */
export interface ProvisionedThroughputDescription {
  /**
  * The date and time of the last provisioned throughput increase for this table.
  */
  LastIncreaseDateTime?: Date | string;
  /**
  * The date and time of the last provisioned throughput decrease for this table.
  */
  LastDecreaseDateTime?: Date | string;
  /**
  * The number of provisioned throughput decreases for this table during this UTC calendar
  * day. For current maximums on provisioned throughput decreases, see Service,
  * Account, and Table Quotas in the Amazon DynamoDB Developer
  * Guide.
  */
  NumberOfDecreasesToday?: number;
  /**
  * The maximum number of strongly consistent reads consumed per second before DynamoDB
  * returns a ThrottlingException. Eventually consistent reads require less
  * effort than strongly consistent reads, so a setting of 50 ReadCapacityUnits
  * per second provides 100 eventually consistent ReadCapacityUnits per
  * second.
  */
  ReadCapacityUnits?: number;
  /**
  * The maximum number of writes consumed per second before DynamoDB returns a
  * ThrottlingException.
  */
  WriteCapacityUnits?: number;
}
/**
 * The request was denied due to request throttling. For detailed information about
 * why the request was throttled and the ARN of the impacted resource, find the ThrottlingReason field in the returned exception. The Amazon Web Services
 * SDKs for DynamoDB automatically retry requests that receive this exception.
 * Your request is eventually successful, unless your retry queue is too large to finish.
 * Reduce the frequency of requests and use exponential backoff. For more information, go
 * to Error Retries and Exponential Backoff in the Amazon DynamoDB Developer Guide.
 */
export declare class ProvisionedThroughputExceededException extends EffectData.TaggedError(
  "ProvisionedThroughputExceededException",
)<{
    /**
   * You exceeded your maximum allowed provisioned throughput.
   */
  readonly message?: string;
    /**
   * A list of ThrottlingReason that
   * provide detailed diagnostic information about why the request was throttled.
   */
  readonly ThrottlingReasons?: Array<ThrottlingReason>;
}> {}
/**
 * Replica-specific provisioned throughput settings. If not specified, uses the source
 * table's provisioned throughput settings.
 */
export interface ProvisionedThroughputOverride {
  /**
  * Replica-specific read capacity units. If not specified, uses the source table's read
  * capacity settings.
  */
  ReadCapacityUnits?: number;
}
/**
 * Represents a request to perform a PutItem operation.
 */
export interface Put {
  /**
  * A map of attribute name to attribute values, representing the primary key of the item
  * to be written by PutItem. All of the table's primary key attributes must be
  * specified, and their data types must match those of the table's key schema. If any
  * attributes are present in the item that are part of an index key schema for the table,
  * their types must match the index key schema.
  */
  Item: Record<string, AttributeValue>;
  /**
  * Name of the table in which to write the item. You can also provide the Amazon Resource Name (ARN) of
  * the table in this parameter.
  */
  TableName: string;
  /**
  * A condition that must be satisfied in order for a conditional update to
  * succeed.
  */
  ConditionExpression?: string;
  /**
  * One or more substitution tokens for attribute names in an expression.
  */
  ExpressionAttributeNames?: Record<string, string>;
  /**
  * One or more values that can be substituted in an expression.
  */
  ExpressionAttributeValues?: Record<string, AttributeValue>;
  /**
  * Use ReturnValuesOnConditionCheckFailure to get the item attributes if the
  * Put condition fails. For
  * ReturnValuesOnConditionCheckFailure, the valid values are: NONE and
  * ALL_OLD.
  */
  ReturnValuesOnConditionCheckFailure?: ReturnValuesOnConditionCheckFailure;
}

/**
 * Represents the input of a PutItem operation.
 */
export interface PutItemInput {
  /**
  * The name of the table to contain the item. You can also provide the Amazon Resource Name (ARN) of the
  * table in this parameter.
  */
  TableName: string;
  /**
  * A map of attribute name/value pairs, one for each attribute. Only the primary key
  * attributes are required; you can optionally provide other attribute name-value pairs for
  * the item.
  * You must provide all of the attributes for the primary key. For example, with a simple
  * primary key, you only need to provide a value for the partition key. For a composite
  * primary key, you must provide both values for both the partition key and the sort
  * key.
  * If you specify any attributes that are part of an index key, then the data types for
  * those attributes must match those of the schema in the table's attribute
  * definition.
  * Empty String and Binary attribute values are allowed. Attribute values of type String
  * and Binary must have a length greater than zero if the attribute is used as a key
  * attribute for a table or index.
  * For more information about primary keys, see Primary Key in the Amazon DynamoDB Developer
  * Guide.
  * Each element in the Item map is an AttributeValue
  * object.
  */
  Item: Record<string, AttributeValue>;
  /**
  * This is a legacy parameter. Use ConditionExpression instead. For more
  * information, see Expected in the Amazon DynamoDB Developer
  * Guide.
  */
  Expected?: Record<string, ExpectedAttributeValue>;
  /**
  * Use ReturnValues if you want to get the item attributes as they appeared
  * before they were updated with the PutItem request. For
  * PutItem, the valid values are:
  * NONE - If ReturnValues is not specified, or if its
  * value is NONE, then nothing is returned. (This setting is the
  * default for ReturnValues.)
  * ALL_OLD - If PutItem overwrote an attribute name-value
  * pair, then the content of the old item is returned.
  * The values returned are strongly consistent.
  * There is no additional cost associated with requesting a return value aside from the
  * small network and processing overhead of receiving a larger response. No read capacity
  * units are consumed.
  * The ReturnValues parameter is used by several DynamoDB operations;
  * however, PutItem does not recognize any values other than
  * NONE or ALL_OLD.
  */
  ReturnValues?: ReturnValue;
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
  /**
  * Determines whether item collection metrics are returned. If set to SIZE,
  * the response includes statistics about item collections, if any, that were modified
  * during the operation are returned in the response. If set to NONE (the
  * default), no statistics are returned.
  */
  ReturnItemCollectionMetrics?: ReturnItemCollectionMetrics;
  /**
  * This is a legacy parameter. Use ConditionExpression instead. For more
  * information, see ConditionalOperator in the Amazon DynamoDB Developer
  * Guide.
  */
  ConditionalOperator?: ConditionalOperator;
  /**
  * A condition that must be satisfied in order for a conditional PutItem
  * operation to succeed.
  * An expression can contain any of the following:
  * Functions: attribute_exists | attribute_not_exists | attribute_type |
  * contains | begins_with | size
  * These function names are case-sensitive.
  * Comparison operators: = | <> |
  * | = |
  * BETWEEN | IN 
  * Logical operators: AND | OR | NOT
  * For more information on condition expressions, see Condition Expressions in the Amazon DynamoDB Developer
  * Guide.
  */
  ConditionExpression?: string;
  /**
  * One or more substitution tokens for attribute names in an expression. The following
  * are some use cases for using ExpressionAttributeNames:
  * To access an attribute whose name conflicts with a DynamoDB reserved
  * word.
  * To create a placeholder for repeating occurrences of an attribute name in an
  * expression.
  * To prevent special characters in an attribute name from being misinterpreted
  * in an expression.
  * Use the # character in an expression to dereference
  * an attribute name. For example, consider the following attribute name:
  * Percentile
  * The name of this attribute conflicts with a reserved word, so it cannot be used
  * directly in an expression. (For the complete list of reserved words, see Reserved Words in the Amazon DynamoDB Developer
  * Guide). To work around this, you could specify the following for
  * ExpressionAttributeNames:
  * {"#P":"Percentile"}
  * You could then use this substitution in an expression, as in this example:
  * #P = :val
  * Tokens that begin with the : character are
  * expression attribute values, which are placeholders for the
  * actual value at runtime.
  * For more information on expression attribute names, see Specifying Item Attributes in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeNames?: Record<string, string>;
  /**
  * One or more values that can be substituted in an expression.
  * Use the : (colon) character in an expression to
  * dereference an attribute value. For example, suppose that you wanted to check whether
  * the value of the ProductStatus attribute was one of the following: 
  * Available | Backordered | Discontinued
  * You would first need to specify ExpressionAttributeValues as
  * follows:
  * { ":avail":{"S":"Available"}, ":back":{"S":"Backordered"},
  * ":disc":{"S":"Discontinued"} }
  * You could then use these values in an expression, such as this:
  * ProductStatus IN (:avail, :back, :disc)
  * For more information on expression attribute values, see Condition Expressions in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeValues?: Record<string, AttributeValue>;
  /**
  * An optional parameter that returns the item attributes for a PutItem
  * operation that failed a condition check.
  * There is no additional cost associated with requesting a return value aside from the
  * small network and processing overhead of receiving a larger response. No read capacity
  * units are consumed.
  */
  ReturnValuesOnConditionCheckFailure?: ReturnValuesOnConditionCheckFailure;
}
export type PutItemInputAttributeMap = Record<string, AttributeValue>
/**
 * Represents the output of a PutItem operation.
 */
export interface PutItemOutput {
  /**
  * The attribute values as they appeared before the PutItem operation, but
  * only if ReturnValues is specified as ALL_OLD in the request.
  * Each element consists of an attribute name and an attribute value.
  */
  Attributes?: Record<string, AttributeValue>;
  /**
  * The capacity units consumed by the PutItem operation. The data returned
  * includes the total provisioned throughput consumed, along with statistics for the table
  * and any indexes involved in the operation. ConsumedCapacity is only
  * returned if the ReturnConsumedCapacity parameter was specified. For more
  * information, see Capacity unity consumption for write operations in the Amazon
  * DynamoDB Developer Guide.
  */
  ConsumedCapacity?: ConsumedCapacity;
  /**
  * Information about item collections, if any, that were affected by the
  * PutItem operation. ItemCollectionMetrics is only returned
  * if the ReturnItemCollectionMetrics parameter was specified. If the table
  * does not have any local secondary indexes, this information is not returned in the
  * response.
  * Each ItemCollectionMetrics element consists of:
  * ItemCollectionKey - The partition key value of the item collection.
  * This is the same as the partition key value of the item itself.
  * SizeEstimateRangeGB - An estimate of item collection size, in
  * gigabytes. This value is a two-element array containing a lower bound and an
  * upper bound for the estimate. The estimate includes the size of all the items in
  * the table, plus the size of all attributes projected into all of the local
  * secondary indexes on that table. Use this estimate to measure whether a local
  * secondary index is approaching its size limit.
  * The estimate is subject to change over time; therefore, do not rely on the
  * precision or accuracy of the estimate.
  */
  ItemCollectionMetrics?: ItemCollectionMetrics;
}
/**
 * Represents a request to perform a PutItem operation on an item.
 */
export interface PutRequest {
  /**
  * A map of attribute name to attribute values, representing the primary key of an item
  * to be processed by PutItem. All of the table's primary key attributes must
  * be specified, and their data types must match those of the table's key schema. If any
  * attributes are present in the item that are part of an index key schema for the table,
  * their types must match the index key schema.
  */
  Item: Record<string, AttributeValue>;
}

export interface PutResourcePolicyInput {
  /**
  * The Amazon Resource Name (ARN) of the DynamoDB resource to which the policy will be attached.
  * The resources you can specify include tables and streams.
  * You can control index permissions using the base table's policy. To specify the same permission level for your table and its indexes, you can provide both the table and index Amazon Resource Name (ARN)s in the Resource field of a given Statement in your policy document. Alternatively, to specify different permissions for your table, indexes, or both, you can define multiple Statement fields in your policy document.
  */
  ResourceArn: string;
  /**
  * An Amazon Web Services resource-based policy document in JSON format.
  * The maximum size supported for a resource-based policy document is 20 KB.
  * DynamoDB counts whitespaces when calculating the size of a policy
  * against this limit.
  * Within a resource-based policy, if the action for a DynamoDB
  * service-linked role (SLR) to replicate data for a global table is denied, adding
  * or deleting a replica will fail with an error.
  * For a full list of all considerations that apply while attaching a resource-based
  * policy, see Resource-based
  * policy considerations.
  */
  Policy: string;
  /**
  * A string value that you can use to conditionally update your policy. You can provide
  * the revision ID of your existing policy to make mutating requests against that
  * policy.
  * When you provide an expected revision ID, if the revision ID of the existing
  * policy on the resource doesn't match or if there's no policy attached to the
  * resource, your request will be rejected with a
  * PolicyNotFoundException.
  * To conditionally attach a policy when no policy exists for the resource, specify
  * NO_POLICY for the revision ID.
  */
  ExpectedRevisionId?: string;
  /**
  * Set this parameter to true to confirm that you want to remove your
  * permissions to change the policy of this resource in the future.
  */
  ConfirmRemoveSelfResourceAccess?: boolean;
}
export interface PutResourcePolicyOutput {
  /**
  * A unique string that represents the revision ID of the policy. If you're comparing revision IDs, make sure to always use string comparison logic.
  */
  RevisionId?: string;
}

/**
 * Represents the input of a Query operation.
 */
export interface QueryInput {
  /**
  * The name of the table containing the requested items. You can also provide the
  * Amazon Resource Name (ARN) of the table in this parameter.
  */
  TableName: string;
  /**
  * The name of an index to query. This index can be any local secondary index or global
  * secondary index on the table. Note that if you use the IndexName parameter,
  * you must also provide TableName.
  */
  IndexName?: string;
  /**
  * The attributes to be returned in the result. You can retrieve all item attributes,
  * specific item attributes, the count of matching items, or in the case of an index, some
  * or all of the attributes projected into the index.
  * ALL_ATTRIBUTES - Returns all of the item attributes from the
  * specified table or index. If you query a local secondary index, then for each
  * matching item in the index, DynamoDB fetches the entire item from the parent
  * table. If the index is configured to project all item attributes, then all of
  * the data can be obtained from the local secondary index, and no fetching is
  * required.
  * ALL_PROJECTED_ATTRIBUTES - Allowed only when querying an index.
  * Retrieves all attributes that have been projected into the index. If the index
  * is configured to project all attributes, this return value is equivalent to
  * specifying ALL_ATTRIBUTES.
  * COUNT - Returns the number of matching items, rather than the
  * matching items themselves. Note that this uses the same quantity of read
  * capacity units as getting the items, and is subject to the same item size
  * calculations.
  * SPECIFIC_ATTRIBUTES - Returns only the attributes listed in
  * ProjectionExpression. This return value is equivalent to
  * specifying ProjectionExpression without specifying any value for
  * Select.
  * If you query or scan a local secondary index and request only attributes that
  * are projected into that index, the operation will read only the index and not
  * the table. If any of the requested attributes are not projected into the local
  * secondary index, DynamoDB fetches each of these attributes from the parent
  * table. This extra fetching incurs additional throughput cost and latency.
  * If you query or scan a global secondary index, you can only request attributes
  * that are projected into the index. Global secondary index queries cannot fetch
  * attributes from the parent table.
  * If neither Select nor ProjectionExpression are specified,
  * DynamoDB defaults to ALL_ATTRIBUTES when accessing a table, and
  * ALL_PROJECTED_ATTRIBUTES when accessing an index. You cannot use both
  * Select and ProjectionExpression together in a single
  * request, unless the value for Select is SPECIFIC_ATTRIBUTES.
  * (This usage is equivalent to specifying ProjectionExpression without any
  * value for Select.)
  * If you use the ProjectionExpression parameter, then the value for
  * Select can only be SPECIFIC_ATTRIBUTES. Any other
  * value for Select will return an error.
  */
  Select?: Select;
  /**
  * This is a legacy parameter. Use ProjectionExpression instead. For more
  * information, see AttributesToGet in the Amazon DynamoDB Developer
  * Guide.
  */
  AttributesToGet?: Array<string>;
  /**
  * The maximum number of items to evaluate (not necessarily the number of matching
  * items). If DynamoDB processes the number of items up to the limit while processing the
  * results, it stops the operation and returns the matching values up to that point, and a
  * key in LastEvaluatedKey to apply in a subsequent operation, so that you can
  * pick up where you left off. Also, if the processed dataset size exceeds 1 MB before
  * DynamoDB reaches this limit, it stops the operation and returns the matching values up
  * to the limit, and a key in LastEvaluatedKey to apply in a subsequent
  * operation to continue the operation. For more information, see Query and Scan in the Amazon DynamoDB Developer
  * Guide.
  */
  Limit?: number;
  /**
  * Determines the read consistency model: If set to true, then the operation
  * uses strongly consistent reads; otherwise, the operation uses eventually consistent
  * reads.
  * Strongly consistent reads are not supported on global secondary indexes. If you query
  * a global secondary index with ConsistentRead set to true, you
  * will receive a ValidationException.
  */
  ConsistentRead?: boolean;
  /**
  * This is a legacy parameter. Use KeyConditionExpression instead. For more
  * information, see KeyConditions in the Amazon DynamoDB Developer
  * Guide.
  */
  KeyConditions?: Record<string, Condition>;
  /**
  * This is a legacy parameter. Use FilterExpression instead. For more
  * information, see QueryFilter in the Amazon DynamoDB Developer
  * Guide.
  */
  QueryFilter?: Record<string, Condition>;
  /**
  * This is a legacy parameter. Use FilterExpression instead. For more
  * information, see ConditionalOperator in the Amazon DynamoDB Developer
  * Guide.
  */
  ConditionalOperator?: ConditionalOperator;
  /**
  * Specifies the order for index traversal: If true (default), the traversal
  * is performed in ascending order; if false, the traversal is performed in
  * descending order. 
  * Items with the same partition key value are stored in sorted order by sort key. If the
  * sort key data type is Number, the results are stored in numeric order. For type String,
  * the results are stored in order of UTF-8 bytes. For type Binary, DynamoDB treats each
  * byte of the binary data as unsigned.
  * If ScanIndexForward is true, DynamoDB returns the results in
  * the order in which they are stored (by sort key value). This is the default behavior. If
  * ScanIndexForward is false, DynamoDB reads the results in
  * reverse order by sort key value, and then returns the results to the client.
  */
  ScanIndexForward?: boolean;
  /**
  * The primary key of the first item that this operation will evaluate. Use the value
  * that was returned for LastEvaluatedKey in the previous operation.
  * The data type for ExclusiveStartKey must be String, Number, or Binary. No
  * set data types are allowed.
  */
  ExclusiveStartKey?: Record<string, AttributeValue>;
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
  /**
  * A string that identifies one or more attributes to retrieve from the table. These
  * attributes can include scalars, sets, or elements of a JSON document. The attributes in
  * the expression must be separated by commas.
  * If no attribute names are specified, then all attributes will be returned. If any of
  * the requested attributes are not found, they will not appear in the result.
  * For more information, see Accessing Item Attributes in the Amazon DynamoDB Developer
  * Guide.
  */
  ProjectionExpression?: string;
  /**
  * A string that contains conditions that DynamoDB applies after the Query
  * operation, but before the data is returned to you. Items that do not satisfy the
  * FilterExpression criteria are not returned.
  * A FilterExpression does not allow key attributes. You cannot define a
  * filter expression based on a partition key or a sort key.
  * A FilterExpression is applied after the items have already been read;
  * the process of filtering does not consume any additional read capacity units.
  * For more information, see Filter
  * Expressions in the Amazon DynamoDB Developer
  * Guide.
  */
  FilterExpression?: string;
  /**
  * The condition that specifies the key values for items to be retrieved by the
  * Query action.
  * The condition must perform an equality test on a single partition key value.
  * The condition can optionally perform one of several comparison tests on a single sort
  * key value. This allows Query to retrieve one item with a given partition
  * key value and sort key value, or several items that have the same partition key value
  * but different sort key values.
  * The partition key equality test is required, and must be specified in the following
  * format:
  * partitionKeyName
  * =
  * :partitionkeyval
  * If you also want to provide a condition for the sort key, it must be combined using
  * AND with the condition for the sort key. Following is an example, using
  * the = comparison operator for the sort key:
  * partitionKeyName
  * =
  * :partitionkeyval
  * AND
  * sortKeyName
  * =
  * :sortkeyval
  * Valid comparisons for the sort key condition are as follows:
  * sortKeyName
  * =
  * :sortkeyval - true if the sort key value is equal to
  * :sortkeyval.
  * sortKeyName
  * :sortkeyval - true if the sort key value is less than
  * :sortkeyval.
  * sortKeyName
  * :sortkeyval - true if the sort key value is less than or equal to
  * :sortkeyval.
  * sortKeyName
  * >
  * :sortkeyval - true if the sort key value is greater than
  * :sortkeyval.
  * sortKeyName
  * >= 
  * :sortkeyval - true if the sort key value is greater than or equal
  * to :sortkeyval.
  * sortKeyName
  * BETWEEN
  * :sortkeyval1
  * AND
  * :sortkeyval2 - true if the sort key value is greater than or equal
  * to :sortkeyval1, and less than or equal to
  * :sortkeyval2.
  * begins_with (
  * sortKeyName, :sortkeyval
  * ) - true if the sort key value begins with a particular operand.
  * (You cannot use this function with a sort key that is of type Number.) Note that
  * the function name begins_with is case-sensitive.
  * Use the ExpressionAttributeValues parameter to replace tokens such as
  * :partitionval and :sortval with actual values at
  * runtime.
  * You can optionally use the ExpressionAttributeNames parameter to replace
  * the names of the partition key and sort key with placeholder tokens. This option might
  * be necessary if an attribute name conflicts with a DynamoDB reserved word. For example,
  * the following KeyConditionExpression parameter causes an error because
  * Size is a reserved word:
  * Size = :myval
  * To work around this, define a placeholder (such a #S) to represent the
  * attribute name Size. KeyConditionExpression then is as
  * follows:
  * #S = :myval
  * For a list of reserved words, see Reserved Words
  * in the Amazon DynamoDB Developer Guide.
  * For more information on ExpressionAttributeNames and
  * ExpressionAttributeValues, see Using
  * Placeholders for Attribute Names and Values in the Amazon DynamoDB
  * Developer Guide.
  */
  KeyConditionExpression?: string;
  /**
  * One or more substitution tokens for attribute names in an expression. The following
  * are some use cases for using ExpressionAttributeNames:
  * To access an attribute whose name conflicts with a DynamoDB reserved
  * word.
  * To create a placeholder for repeating occurrences of an attribute name in an
  * expression.
  * To prevent special characters in an attribute name from being misinterpreted
  * in an expression.
  * Use the # character in an expression to dereference
  * an attribute name. For example, consider the following attribute name:
  * Percentile
  * The name of this attribute conflicts with a reserved word, so it cannot be used
  * directly in an expression. (For the complete list of reserved words, see Reserved Words in the Amazon DynamoDB Developer
  * Guide). To work around this, you could specify the following for
  * ExpressionAttributeNames:
  * {"#P":"Percentile"}
  * You could then use this substitution in an expression, as in this example:
  * #P = :val
  * Tokens that begin with the : character are
  * expression attribute values, which are placeholders for the
  * actual value at runtime.
  * For more information on expression attribute names, see Specifying Item Attributes in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeNames?: Record<string, string>;
  /**
  * One or more values that can be substituted in an expression.
  * Use the : (colon) character in an expression to
  * dereference an attribute value. For example, suppose that you wanted to check whether
  * the value of the ProductStatus attribute was one of the following: 
  * Available | Backordered | Discontinued
  * You would first need to specify ExpressionAttributeValues as
  * follows:
  * { ":avail":{"S":"Available"}, ":back":{"S":"Backordered"},
  * ":disc":{"S":"Discontinued"} }
  * You could then use these values in an expression, such as this:
  * ProductStatus IN (:avail, :back, :disc)
  * For more information on expression attribute values, see Specifying Conditions in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeValues?: Record<string, AttributeValue>;
}
/**
 * Represents the output of a Query operation.
 */
export interface QueryOutput {
  /**
  * An array of item attributes that match the query criteria. Each element in this array
  * consists of an attribute name and the value for that attribute.
  */
  Items?: Array<Record<string, AttributeValue>>;
  /**
  * The number of items in the response.
  * If you used a QueryFilter in the request, then Count is the
  * number of items returned after the filter was applied, and ScannedCount is
  * the number of matching items before the filter was applied.
  * If you did not use a filter in the request, then Count and
  * ScannedCount are the same.
  */
  Count?: number;
  /**
  * The number of items evaluated, before any QueryFilter is applied. A high
  * ScannedCount value with few, or no, Count results
  * indicates an inefficient Query operation. For more information, see Count and ScannedCount in the Amazon DynamoDB Developer
  * Guide.
  * If you did not use a filter in the request, then ScannedCount is the same
  * as Count.
  */
  ScannedCount?: number;
  /**
  * The primary key of the item where the operation stopped, inclusive of the previous
  * result set. Use this value to start a new operation, excluding this value in the new
  * request.
  * If LastEvaluatedKey is empty, then the "last page" of results has been
  * processed and there is no more data to be retrieved.
  * If LastEvaluatedKey is not empty, it does not necessarily mean that there
  * is more data in the result set. The only way to know when you have reached the end of
  * the result set is when LastEvaluatedKey is empty.
  */
  LastEvaluatedKey?: Record<string, AttributeValue>;
  /**
  * The capacity units consumed by the Query operation. The data returned
  * includes the total provisioned throughput consumed, along with statistics for the table
  * and any indexes involved in the operation. ConsumedCapacity is only
  * returned if the ReturnConsumedCapacity parameter was specified. For more
  * information, see Capacity unit consumption for read operations in the Amazon
  * DynamoDB Developer Guide.
  */
  ConsumedCapacity?: ConsumedCapacity;
}
export type Reason = string;
export type RecoveryPeriodInDays = number;
export type RegionName = string;
/**
 * Represents the properties of a replica.
 */
export interface Replica {
  /**
  * The Region where the replica needs to be created.
  */
  RegionName?: string;
}
/**
 * The specified replica is already part of the global table.
 */
export declare class ReplicaAlreadyExistsException extends EffectData.TaggedError(
  "ReplicaAlreadyExistsException",
)<{
  readonly message?: string;
}> {}
/**
 * Represents the auto scaling settings of the replica.
 */
export interface ReplicaAutoScalingDescription {
  /**
  * The Region where the replica exists.
  */
  RegionName?: string;
  /**
  * Replica-specific global secondary index auto scaling settings.
  */
  GlobalSecondaryIndexes?: Array<ReplicaGlobalSecondaryIndexAutoScalingDescription>;
  ReplicaProvisionedReadCapacityAutoScalingSettings?: AutoScalingSettingsDescription;
  ReplicaProvisionedWriteCapacityAutoScalingSettings?: AutoScalingSettingsDescription;
  /**
  * The current state of the replica:
  * CREATING - The replica is being created.
  * UPDATING - The replica is being updated.
  * DELETING - The replica is being deleted.
  * ACTIVE - The replica is ready for use.
  */
  ReplicaStatus?: ReplicaStatus;
}
export type ReplicaAutoScalingDescriptionList = Array<ReplicaAutoScalingDescription>;
/**
 * Represents the auto scaling settings of a replica that will be modified.
 */
export interface ReplicaAutoScalingUpdate {
  /**
  * The Region where the replica exists.
  */
  RegionName: string;
  /**
  * Represents the auto scaling settings of global secondary indexes that will be
  * modified.
  */
  ReplicaGlobalSecondaryIndexUpdates?: Array<ReplicaGlobalSecondaryIndexAutoScalingUpdate>;
  ReplicaProvisionedReadCapacityAutoScalingUpdate?: AutoScalingSettingsUpdate;
}
export type ReplicaAutoScalingUpdateList = Array<ReplicaAutoScalingUpdate>;
/**
 * Contains the details of the replica.
 */
export interface ReplicaDescription {
  /**
  * The name of the Region.
  */
  RegionName?: string;
  /**
  * The current state of the replica:
  * CREATING - The replica is being created.
  * UPDATING - The replica is being updated.
  * DELETING - The replica is being deleted.
  * ACTIVE - The replica is ready for use.
  * REGION_DISABLED - The replica is inaccessible because the Amazon Web Services Region has been disabled.
  * If the Amazon Web Services Region remains inaccessible for more than 20
  * hours, DynamoDB will remove this replica from the replication
  * group. The replica will not be deleted and replication will stop from and to
  * this region.
  * INACCESSIBLE_ENCRYPTION_CREDENTIALS  - The KMS key
  * used to encrypt the table is inaccessible.
  * If the KMS key remains inaccessible for more than 20 hours,
  * DynamoDB will remove this replica from the replication group.
  * The replica will not be deleted and replication will stop from and to this
  * region.
  */
  ReplicaStatus?: ReplicaStatus;
  /**
  * Detailed information about the replica status.
  */
  ReplicaStatusDescription?: string;
  /**
  * Specifies the progress of a Create, Update, or Delete action on the replica as a
  * percentage.
  */
  ReplicaStatusPercentProgress?: string;
  /**
  * The KMS key of the replica that will be used for KMS
  * encryption.
  */
  KMSMasterKeyId?: string;
  /**
  * Replica-specific provisioned throughput. If not described, uses the source table's
  * provisioned throughput settings.
  */
  ProvisionedThroughputOverride?: ProvisionedThroughputOverride;
  /**
  * Overrides the maximum on-demand throughput settings for the specified replica
  * table.
  */
  OnDemandThroughputOverride?: OnDemandThroughputOverride;
  /**
  * Represents the warm throughput value for this replica.
  */
  WarmThroughput?: TableWarmThroughputDescription;
  /**
  * Replica-specific global secondary index settings.
  */
  GlobalSecondaryIndexes?: Array<ReplicaGlobalSecondaryIndexDescription>;
  /**
  * The time at which the replica was first detected as inaccessible. To determine cause
  * of inaccessibility check the ReplicaStatus property.
  */
  ReplicaInaccessibleDateTime?: Date | string;
  ReplicaTableClassSummary?: TableClassSummary;
}
export type ReplicaDescriptionList = Array<ReplicaDescription>;
/**
 * Represents the properties of a replica global secondary index.
 */
export interface ReplicaGlobalSecondaryIndex {
  /**
  * The name of the global secondary index.
  */
  IndexName: string;
  /**
  * Replica table GSI-specific provisioned throughput. If not specified, uses the source
  * table GSI's read capacity settings.
  */
  ProvisionedThroughputOverride?: ProvisionedThroughputOverride;
  /**
  * Overrides the maximum on-demand throughput settings for the specified global secondary
  * index in the specified replica table.
  */
  OnDemandThroughputOverride?: OnDemandThroughputOverride;
}
/**
 * Represents the auto scaling configuration for a replica global secondary index.
 */
export interface ReplicaGlobalSecondaryIndexAutoScalingDescription {
  /**
  * The name of the global secondary index.
  */
  IndexName?: string;
  /**
  * The current state of the replica global secondary index:
  * CREATING - The index is being created.
  * UPDATING - The table/index configuration is being updated. The
  * table/index remains available for data operations when
  * UPDATING
  * DELETING - The index is being deleted.
  * ACTIVE - The index is ready for use.
  */
  IndexStatus?: IndexStatus;
  ProvisionedReadCapacityAutoScalingSettings?: AutoScalingSettingsDescription;
  ProvisionedWriteCapacityAutoScalingSettings?: AutoScalingSettingsDescription;
}
export type ReplicaGlobalSecondaryIndexAutoScalingDescriptionList = Array<ReplicaGlobalSecondaryIndexAutoScalingDescription>;
/**
 * Represents the auto scaling settings of a global secondary index for a replica that
 * will be modified.
 */
export interface ReplicaGlobalSecondaryIndexAutoScalingUpdate {
  /**
  * The name of the global secondary index.
  */
  IndexName?: string;
  ProvisionedReadCapacityAutoScalingUpdate?: AutoScalingSettingsUpdate;
}
export type ReplicaGlobalSecondaryIndexAutoScalingUpdateList = Array<ReplicaGlobalSecondaryIndexAutoScalingUpdate>;
/**
 * Represents the properties of a replica global secondary index.
 */
export interface ReplicaGlobalSecondaryIndexDescription {
  /**
  * The name of the global secondary index.
  */
  IndexName?: string;
  /**
  * If not described, uses the source table GSI's read capacity settings.
  */
  ProvisionedThroughputOverride?: ProvisionedThroughputOverride;
  /**
  * Overrides the maximum on-demand throughput for the specified global secondary index in
  * the specified replica table.
  */
  OnDemandThroughputOverride?: OnDemandThroughputOverride;
  /**
  * Represents the warm throughput of the global secondary index for this replica.
  */
  WarmThroughput?: GlobalSecondaryIndexWarmThroughputDescription;
}
export type ReplicaGlobalSecondaryIndexDescriptionList = Array<ReplicaGlobalSecondaryIndexDescription>;
export type ReplicaGlobalSecondaryIndexList = Array<ReplicaGlobalSecondaryIndex>;
/**
 * Represents the properties of a global secondary index.
 */
export interface ReplicaGlobalSecondaryIndexSettingsDescription {
  /**
  * The name of the global secondary index. The name must be unique among all other
  * indexes on this table.
  */
  IndexName: string;
  /**
  * The current status of the global secondary index:
  * CREATING - The global secondary index is being created.
  * UPDATING - The global secondary index is being updated.
  * DELETING - The global secondary index is being deleted.
  * ACTIVE - The global secondary index is ready for use.
  */
  IndexStatus?: IndexStatus;
  /**
  * The maximum number of strongly consistent reads consumed per second before DynamoDB
  * returns a ThrottlingException.
  */
  ProvisionedReadCapacityUnits?: number;
  /**
  * Auto scaling settings for a global secondary index replica's read capacity
  * units.
  */
  ProvisionedReadCapacityAutoScalingSettings?: AutoScalingSettingsDescription;
  /**
  * The maximum number of writes consumed per second before DynamoDB returns a
  * ThrottlingException.
  */
  ProvisionedWriteCapacityUnits?: number;
  /**
  * Auto scaling settings for a global secondary index replica's write capacity
  * units.
  */
  ProvisionedWriteCapacityAutoScalingSettings?: AutoScalingSettingsDescription;
}
export type ReplicaGlobalSecondaryIndexSettingsDescriptionList = Array<ReplicaGlobalSecondaryIndexSettingsDescription>;
/**
 * Represents the settings of a global secondary index for a global table that will be
 * modified.
 */
export interface ReplicaGlobalSecondaryIndexSettingsUpdate {
  /**
  * The name of the global secondary index. The name must be unique among all other
  * indexes on this table.
  */
  IndexName: string;
  /**
  * The maximum number of strongly consistent reads consumed per second before DynamoDB
  * returns a ThrottlingException.
  */
  ProvisionedReadCapacityUnits?: number;
  /**
  * Auto scaling settings for managing a global secondary index replica's read capacity
  * units.
  */
  ProvisionedReadCapacityAutoScalingSettingsUpdate?: AutoScalingSettingsUpdate;
}
export type ReplicaGlobalSecondaryIndexSettingsUpdateList = Array<ReplicaGlobalSecondaryIndexSettingsUpdate>;
export type ReplicaList = Array<Replica>;
/**
 * The specified replica is no longer part of the global table.
 */
export declare class ReplicaNotFoundException extends EffectData.TaggedError(
  "ReplicaNotFoundException",
)<{
  readonly message?: string;
}> {}
/**
 * Represents the properties of a replica.
 */
export interface ReplicaSettingsDescription {
  /**
  * The Region name of the replica.
  */
  RegionName: string;
  /**
  * The current state of the Region:
  * CREATING - The Region is being created.
  * UPDATING - The Region is being updated.
  * DELETING - The Region is being deleted.
  * ACTIVE - The Region is ready for use.
  */
  ReplicaStatus?: ReplicaStatus;
  /**
  * The read/write capacity mode of the replica.
  */
  ReplicaBillingModeSummary?: BillingModeSummary;
  /**
  * The maximum number of strongly consistent reads consumed per second before DynamoDB
  * returns a ThrottlingException. For more information, see Specifying Read and Write Requirements in the Amazon DynamoDB
  * Developer Guide.
  */
  ReplicaProvisionedReadCapacityUnits?: number;
  /**
  * Auto scaling settings for a global table replica's read capacity units.
  */
  ReplicaProvisionedReadCapacityAutoScalingSettings?: AutoScalingSettingsDescription;
  /**
  * The maximum number of writes consumed per second before DynamoDB returns a
  * ThrottlingException. For more information, see Specifying Read and Write Requirements in the Amazon DynamoDB
  * Developer Guide.
  */
  ReplicaProvisionedWriteCapacityUnits?: number;
  /**
  * Auto scaling settings for a global table replica's write capacity units.
  */
  ReplicaProvisionedWriteCapacityAutoScalingSettings?: AutoScalingSettingsDescription;
  /**
  * Replica global secondary index settings for the global table.
  */
  ReplicaGlobalSecondaryIndexSettings?: Array<ReplicaGlobalSecondaryIndexSettingsDescription>;
  ReplicaTableClassSummary?: TableClassSummary;
}
export type ReplicaSettingsDescriptionList = Array<ReplicaSettingsDescription>;
/**
 * Represents the settings for a global table in a Region that will be modified.
 */
export interface ReplicaSettingsUpdate {
  /**
  * The Region of the replica to be added.
  */
  RegionName: string;
  /**
  * The maximum number of strongly consistent reads consumed per second before DynamoDB
  * returns a ThrottlingException. For more information, see Specifying Read and Write Requirements in the Amazon DynamoDB
  * Developer Guide.
  */
  ReplicaProvisionedReadCapacityUnits?: number;
  /**
  * Auto scaling settings for managing a global table replica's read capacity
  * units.
  */
  ReplicaProvisionedReadCapacityAutoScalingSettingsUpdate?: AutoScalingSettingsUpdate;
  /**
  * Represents the settings of a global secondary index for a global table that will be
  * modified.
  */
  ReplicaGlobalSecondaryIndexSettingsUpdate?: Array<ReplicaGlobalSecondaryIndexSettingsUpdate>;
  /**
  * Replica-specific table class. If not specified, uses the source table's table
  * class.
  */
  ReplicaTableClass?: TableClass;
}
export type ReplicaSettingsUpdateList = Array<ReplicaSettingsUpdate>;
export type ReplicaStatus = "CREATING" | "CREATION_FAILED" | "UPDATING" | "DELETING" | "ACTIVE" | "REGION_DISABLED" | "INACCESSIBLE_ENCRYPTION_CREDENTIALS" | "ARCHIVING" | "ARCHIVED" | "REPLICATION_NOT_AUTHORIZED";
export type ReplicaStatusDescription = string;
export type ReplicaStatusPercentProgress = string;
/**
 * The request was rejected because one or more items in the request are being modified
 * by a request in another Region.
 */
export declare class ReplicatedWriteConflictException extends EffectData.TaggedError(
  "ReplicatedWriteConflictException",
)<{
  readonly message?: string;
}> {}
/**
 * Represents one of the following:
 * A new replica to be added to an existing regional table or global table. This
 * request invokes the CreateTableReplica action in the destination
 * Region.
 * New parameters for an existing replica. This request invokes the
 * UpdateTable action in the destination Region.
 * An existing replica to be deleted. The request invokes the
 * DeleteTableReplica action in the destination Region, deleting
 * the replica and all if its items in the destination Region.
 * When you manually remove a table or global table replica, you do not automatically
 * remove any associated scalable targets, scaling policies, or CloudWatch
 * alarms.
 */
export interface ReplicationGroupUpdate {
  /**
  * The parameters required for creating a replica for the table.
  */
  Create?: CreateReplicationGroupMemberAction;
  /**
  * The parameters required for updating a replica for the table.
  */
  Update?: UpdateReplicationGroupMemberAction;
  /**
  * The parameters required for deleting a replica for the table.
  */
  Delete?: DeleteReplicationGroupMemberAction;
}
export type ReplicationGroupUpdateList = Array<ReplicationGroupUpdate>;
/**
 * Represents one of the following:
 * A new replica to be added to an existing global table.
 * New parameters for an existing replica.
 * An existing replica to be removed from an existing global table.
 */
export interface ReplicaUpdate {
  /**
  * The parameters required for creating a replica on an existing global table.
  */
  Create?: CreateReplicaAction;
  /**
  * The name of the existing replica to be removed.
  */
  Delete?: DeleteReplicaAction;
}
export type ReplicaUpdateList = Array<ReplicaUpdate>;
/**
 * Throughput exceeds the current throughput quota for your account. For detailed
 * information about why the request was throttled and the ARN of the impacted resource,
 * find the ThrottlingReason field in the returned exception. Contact Amazon Web ServicesSupport to request a quota
 * increase.
 */
export declare class RequestLimitExceeded extends EffectData.TaggedError(
  "RequestLimitExceeded",
)<{
  readonly message?: string;
    /**
   * A list of ThrottlingReason that
   * provide detailed diagnostic information about why the request was throttled.
   */
  readonly ThrottlingReasons?: Array<ThrottlingReason>;
}> {}
export type Resource = string;
export type ResourceArnString = string;
/**
 * The operation conflicts with the resource's availability. For example:
 * You attempted to recreate an existing table.
 * You tried to delete a table currently in the CREATING
 * state.
 * You tried to update a resource that was already being updated.
 * When appropriate, wait for the ongoing update to complete and attempt the request
 * again.
 */
export declare class ResourceInUseException extends EffectData.TaggedError(
  "ResourceInUseException",
)<{
    /**
   * The resource which is being attempted to be changed is in use.
   */
  readonly message?: string;
}> {}
/**
 * The operation tried to access a nonexistent table or index. The resource might not
 * be specified correctly, or its status might not be ACTIVE.
 */
export declare class ResourceNotFoundException extends EffectData.TaggedError(
  "ResourceNotFoundException",
)<{
    /**
   * The resource which is being requested does not exist.
   */
  readonly message?: string;
}> {}
export type ResourcePolicy = string;
export type RestoreInProgress = boolean;
/**
 * Contains details for the restore.
 */
export interface RestoreSummary {
  /**
  * The Amazon Resource Name (ARN) of the backup from which the table was restored.
  */
  SourceBackupArn?: string;
  /**
  * The ARN of the source table of the backup that is being restored.
  */
  SourceTableArn?: string;
  /**
  * Point in time or source backup time.
  */
  RestoreDateTime: Date | string;
  /**
  * Indicates if a restore is in progress or not.
  */
  RestoreInProgress: boolean;
}

export interface RestoreTableFromBackupInput {
  /**
  * The name of the new table to which the backup must be restored.
  */
  TargetTableName: string;
  /**
  * The Amazon Resource Name (ARN) associated with the backup.
  */
  BackupArn: string;
  /**
  * The billing mode of the restored table.
  */
  BillingModeOverride?: BillingMode;
  /**
  * List of global secondary indexes for the restored table. The indexes provided should
  * match existing secondary indexes. You can choose to exclude some or all of the indexes
  * at the time of restore.
  */
  GlobalSecondaryIndexOverride?: Array<GlobalSecondaryIndex>;
  /**
  * List of local secondary indexes for the restored table. The indexes provided should
  * match existing secondary indexes. You can choose to exclude some or all of the indexes
  * at the time of restore.
  */
  LocalSecondaryIndexOverride?: Array<LocalSecondaryIndex>;
  /**
  * Provisioned throughput settings for the restored table.
  */
  ProvisionedThroughputOverride?: ProvisionedThroughput;
  OnDemandThroughputOverride?: OnDemandThroughput;
  /**
  * The new server-side encryption settings for the restored table.
  */
  SSESpecificationOverride?: SSESpecification;
}
export interface RestoreTableFromBackupOutput {
  /**
  * The description of the table created from an existing backup.
  */
  TableDescription?: TableDescription;
}

export interface RestoreTableToPointInTimeInput {
  /**
  * The DynamoDB table that will be restored. This value is an Amazon Resource Name
  * (ARN).
  */
  SourceTableArn?: string;
  /**
  * Name of the source table that is being restored.
  */
  SourceTableName?: string;
  /**
  * The name of the new table to which it must be restored to.
  */
  TargetTableName: string;
  /**
  * Restore the table to the latest possible time. LatestRestorableDateTime
  * is typically 5 minutes before the current time.
  */
  UseLatestRestorableTime?: boolean;
  /**
  * Time in the past to restore the table to.
  */
  RestoreDateTime?: Date | string;
  /**
  * The billing mode of the restored table.
  */
  BillingModeOverride?: BillingMode;
  /**
  * List of global secondary indexes for the restored table. The indexes provided should
  * match existing secondary indexes. You can choose to exclude some or all of the indexes
  * at the time of restore.
  */
  GlobalSecondaryIndexOverride?: Array<GlobalSecondaryIndex>;
  /**
  * List of local secondary indexes for the restored table. The indexes provided should
  * match existing secondary indexes. You can choose to exclude some or all of the indexes
  * at the time of restore.
  */
  LocalSecondaryIndexOverride?: Array<LocalSecondaryIndex>;
  /**
  * Provisioned throughput settings for the restored table.
  */
  ProvisionedThroughputOverride?: ProvisionedThroughput;
  OnDemandThroughputOverride?: OnDemandThroughput;
  /**
  * The new server-side encryption settings for the restored table.
  */
  SSESpecificationOverride?: SSESpecification;
}
export interface RestoreTableToPointInTimeOutput {
  /**
  * Represents the properties of a table.
  */
  TableDescription?: TableDescription;
}
/**
 * Determines the level of detail about either provisioned or on-demand throughput
 * consumption that is returned in the response:
 * INDEXES - The response includes the aggregate
 * ConsumedCapacity for the operation, together with
 * ConsumedCapacity for each table and secondary index that was
 * accessed.
 * Note that some operations, such as GetItem and
 * BatchGetItem, do not access any indexes at all. In these cases,
 * specifying INDEXES will only return ConsumedCapacity
 * information for table(s).
 * TOTAL - The response includes only the aggregate
 * ConsumedCapacity for the operation.
 * NONE - No ConsumedCapacity details are included in the
 * response.
 */
export type ReturnConsumedCapacity = "INDEXES" | "TOTAL" | "NONE";
export type ReturnItemCollectionMetrics = "SIZE" | "NONE";
export type ReturnValue = "NONE" | "ALL_OLD" | "UPDATED_OLD" | "ALL_NEW" | "UPDATED_NEW";
export type ReturnValuesOnConditionCheckFailure = "ALL_OLD" | "NONE";
export type S3Bucket = string;
export type S3BucketOwner = string;
/**
 * The S3 bucket that is being imported from.
 */
export interface S3BucketSource {
  /**
  * The account number of the S3 bucket that is being imported from. If the bucket is
  * owned by the requester this is optional.
  */
  S3BucketOwner?: string;
  /**
  * The S3 bucket that is being imported from.
  */
  S3Bucket: string;
  /**
  * The key prefix shared by all S3 Objects that are being imported.
  */
  S3KeyPrefix?: string;
}
export type S3Prefix = string;
export type S3SseAlgorithm = "AES256" | "KMS";
export type S3SseKmsKeyId = string;
export type ScalarAttributeType = "S" | "N" | "B";

/**
 * Represents the input of a Scan operation.
 */
export interface ScanInput {
  /**
  * The name of the table containing the requested items or if you provide
  * IndexName, the name of the table to which that index belongs.
  * You can also provide the Amazon Resource Name (ARN) of the table in this parameter.
  */
  TableName: string;
  /**
  * The name of a secondary index to scan. This index can be any local secondary index or
  * global secondary index. Note that if you use the IndexName parameter, you
  * must also provide TableName.
  */
  IndexName?: string;
  /**
  * This is a legacy parameter. Use ProjectionExpression instead. For more
  * information, see AttributesToGet in the Amazon DynamoDB Developer
  * Guide.
  */
  AttributesToGet?: Array<string>;
  /**
  * The maximum number of items to evaluate (not necessarily the number of matching
  * items). If DynamoDB processes the number of items up to the limit while processing the
  * results, it stops the operation and returns the matching values up to that point, and a
  * key in LastEvaluatedKey to apply in a subsequent operation, so that you can
  * pick up where you left off. Also, if the processed dataset size exceeds 1 MB before
  * DynamoDB reaches this limit, it stops the operation and returns the matching values up
  * to the limit, and a key in LastEvaluatedKey to apply in a subsequent
  * operation to continue the operation. For more information, see Working with Queries in the Amazon DynamoDB Developer
  * Guide.
  */
  Limit?: number;
  /**
  * The attributes to be returned in the result. You can retrieve all item attributes,
  * specific item attributes, the count of matching items, or in the case of an index, some
  * or all of the attributes projected into the index.
  * ALL_ATTRIBUTES - Returns all of the item attributes from the
  * specified table or index. If you query a local secondary index, then for each
  * matching item in the index, DynamoDB fetches the entire item from the parent
  * table. If the index is configured to project all item attributes, then all of
  * the data can be obtained from the local secondary index, and no fetching is
  * required.
  * ALL_PROJECTED_ATTRIBUTES - Allowed only when querying an index.
  * Retrieves all attributes that have been projected into the index. If the index
  * is configured to project all attributes, this return value is equivalent to
  * specifying ALL_ATTRIBUTES.
  * COUNT - Returns the number of matching items, rather than the
  * matching items themselves. Note that this uses the same quantity of read
  * capacity units as getting the items, and is subject to the same item size
  * calculations.
  * SPECIFIC_ATTRIBUTES - Returns only the attributes listed in
  * ProjectionExpression. This return value is equivalent to
  * specifying ProjectionExpression without specifying any value for
  * Select.
  * If you query or scan a local secondary index and request only attributes that
  * are projected into that index, the operation reads only the index and not the
  * table. If any of the requested attributes are not projected into the local
  * secondary index, DynamoDB fetches each of these attributes from the parent
  * table. This extra fetching incurs additional throughput cost and latency.
  * If you query or scan a global secondary index, you can only request attributes
  * that are projected into the index. Global secondary index queries cannot fetch
  * attributes from the parent table.
  * If neither Select nor ProjectionExpression are specified,
  * DynamoDB defaults to ALL_ATTRIBUTES when accessing a table, and
  * ALL_PROJECTED_ATTRIBUTES when accessing an index. You cannot use both
  * Select and ProjectionExpression together in a single
  * request, unless the value for Select is SPECIFIC_ATTRIBUTES.
  * (This usage is equivalent to specifying ProjectionExpression without any
  * value for Select.)
  * If you use the ProjectionExpression parameter, then the value for
  * Select can only be SPECIFIC_ATTRIBUTES. Any other
  * value for Select will return an error.
  */
  Select?: Select;
  /**
  * This is a legacy parameter. Use FilterExpression instead. For more
  * information, see ScanFilter in the Amazon DynamoDB Developer
  * Guide.
  */
  ScanFilter?: Record<string, Condition>;
  /**
  * This is a legacy parameter. Use FilterExpression instead. For more
  * information, see ConditionalOperator in the Amazon DynamoDB Developer
  * Guide.
  */
  ConditionalOperator?: ConditionalOperator;
  /**
  * The primary key of the first item that this operation will evaluate. Use the value
  * that was returned for LastEvaluatedKey in the previous operation.
  * The data type for ExclusiveStartKey must be String, Number or Binary. No
  * set data types are allowed.
  * In a parallel scan, a Scan request that includes
  * ExclusiveStartKey must specify the same segment whose previous
  * Scan returned the corresponding value of
  * LastEvaluatedKey.
  */
  ExclusiveStartKey?: Record<string, AttributeValue>;
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
  /**
  * For a parallel Scan request, TotalSegments represents the
  * total number of segments into which the Scan operation will be divided. The
  * value of TotalSegments corresponds to the number of application workers
  * that will perform the parallel scan. For example, if you want to use four application
  * threads to scan a table or an index, specify a TotalSegments value of
  * 4.
  * The value for TotalSegments must be greater than or equal to 1, and less
  * than or equal to 1000000. If you specify a TotalSegments value of 1, the
  * Scan operation will be sequential rather than parallel.
  * If you specify TotalSegments, you must also specify
  * Segment.
  */
  TotalSegments?: number;
  /**
  * For a parallel Scan request, Segment identifies an
  * individual segment to be scanned by an application worker.
  * Segment IDs are zero-based, so the first segment is always 0. For example, if you want
  * to use four application threads to scan a table or an index, then the first thread
  * specifies a Segment value of 0, the second thread specifies 1, and so
  * on.
  * The value of LastEvaluatedKey returned from a parallel Scan
  * request must be used as ExclusiveStartKey with the same segment ID in a
  * subsequent Scan operation.
  * The value for Segment must be greater than or equal to 0, and less than
  * the value provided for TotalSegments.
  * If you provide Segment, you must also provide
  * TotalSegments.
  */
  Segment?: number;
  /**
  * A string that identifies one or more attributes to retrieve from the specified table
  * or index. These attributes can include scalars, sets, or elements of a JSON document.
  * The attributes in the expression must be separated by commas.
  * If no attribute names are specified, then all attributes will be returned. If any of
  * the requested attributes are not found, they will not appear in the result.
  * For more information, see Specifying Item Attributes in the Amazon DynamoDB Developer
  * Guide.
  */
  ProjectionExpression?: string;
  /**
  * A string that contains conditions that DynamoDB applies after the Scan
  * operation, but before the data is returned to you. Items that do not satisfy the
  * FilterExpression criteria are not returned.
  * A FilterExpression is applied after the items have already been read;
  * the process of filtering does not consume any additional read capacity units.
  * For more information, see Filter
  * Expressions in the Amazon DynamoDB Developer
  * Guide.
  */
  FilterExpression?: string;
  /**
  * One or more substitution tokens for attribute names in an expression. The following
  * are some use cases for using ExpressionAttributeNames:
  * To access an attribute whose name conflicts with a DynamoDB reserved
  * word.
  * To create a placeholder for repeating occurrences of an attribute name in an
  * expression.
  * To prevent special characters in an attribute name from being misinterpreted
  * in an expression.
  * Use the # character in an expression to dereference
  * an attribute name. For example, consider the following attribute name:
  * Percentile
  * The name of this attribute conflicts with a reserved word, so it cannot be used
  * directly in an expression. (For the complete list of reserved words, see Reserved Words in the Amazon DynamoDB Developer
  * Guide). To work around this, you could specify the following for
  * ExpressionAttributeNames:
  * {"#P":"Percentile"}
  * You could then use this substitution in an expression, as in this example:
  * #P = :val
  * Tokens that begin with the : character are
  * expression attribute values, which are placeholders for the
  * actual value at runtime.
  * For more information on expression attribute names, see Specifying Item Attributes in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeNames?: Record<string, string>;
  /**
  * One or more values that can be substituted in an expression.
  * Use the : (colon) character in an expression to
  * dereference an attribute value. For example, suppose that you wanted to check whether
  * the value of the ProductStatus attribute was one of the following: 
  * Available | Backordered | Discontinued
  * You would first need to specify ExpressionAttributeValues as
  * follows:
  * { ":avail":{"S":"Available"}, ":back":{"S":"Backordered"},
  * ":disc":{"S":"Discontinued"} }
  * You could then use these values in an expression, such as this:
  * ProductStatus IN (:avail, :back, :disc)
  * For more information on expression attribute values, see Condition Expressions in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeValues?: Record<string, AttributeValue>;
  /**
  * A Boolean value that determines the read consistency model during the scan:
  * If ConsistentRead is false, then the data returned
  * from Scan might not contain the results from other recently
  * completed write operations (PutItem, UpdateItem, or
  * DeleteItem).
  * If ConsistentRead is true, then all of the write
  * operations that completed before the Scan began are guaranteed to
  * be contained in the Scan response.
  * The default setting for ConsistentRead is false.
  * The ConsistentRead parameter is not supported on global secondary
  * indexes. If you scan a global secondary index with ConsistentRead set to
  * true, you will receive a ValidationException.
  */
  ConsistentRead?: boolean;
}
/**
 * Represents the output of a Scan operation.
 */
export interface ScanOutput {
  /**
  * An array of item attributes that match the scan criteria. Each element in this array
  * consists of an attribute name and the value for that attribute.
  */
  Items?: Array<Record<string, AttributeValue>>;
  /**
  * The number of items in the response.
  * If you set ScanFilter in the request, then Count is the
  * number of items returned after the filter was applied, and ScannedCount is
  * the number of matching items before the filter was applied.
  * If you did not use a filter in the request, then Count is the same as
  * ScannedCount.
  */
  Count?: number;
  /**
  * The number of items evaluated, before any ScanFilter is applied. A high
  * ScannedCount value with few, or no, Count results
  * indicates an inefficient Scan operation. For more information, see Count and
  * ScannedCount in the Amazon DynamoDB Developer
  * Guide.
  * If you did not use a filter in the request, then ScannedCount is the same
  * as Count.
  */
  ScannedCount?: number;
  /**
  * The primary key of the item where the operation stopped, inclusive of the previous
  * result set. Use this value to start a new operation, excluding this value in the new
  * request.
  * If LastEvaluatedKey is empty, then the "last page" of results has been
  * processed and there is no more data to be retrieved.
  * If LastEvaluatedKey is not empty, it does not necessarily mean that there
  * is more data in the result set. The only way to know when you have reached the end of
  * the result set is when LastEvaluatedKey is empty.
  */
  LastEvaluatedKey?: Record<string, AttributeValue>;
  /**
  * The capacity units consumed by the Scan operation. The data returned
  * includes the total provisioned throughput consumed, along with statistics for the table
  * and any indexes involved in the operation. ConsumedCapacity is only
  * returned if the ReturnConsumedCapacity parameter was specified. For more
  * information, see Capacity unit consumption for read operations in the Amazon
  * DynamoDB Developer Guide.
  */
  ConsumedCapacity?: ConsumedCapacity;
}
export type ScanSegment = number;
export type ScanTotalSegments = number;
export type SecondaryIndexesCapacityMap = Record<string, Capacity>
export type Select = "ALL_ATTRIBUTES" | "ALL_PROJECTED_ATTRIBUTES" | "SPECIFIC_ATTRIBUTES" | "COUNT";
/**
 * Contains the details of the table when the backup was created.
 */
export interface SourceTableDetails {
  /**
  * The name of the table for which the backup was created.
  */
  TableName: string;
  /**
  * Unique identifier for the table for which the backup was created.
  */
  TableId: string;
  /**
  * ARN of the table for which backup was created.
  */
  TableArn?: string;
  /**
  * Size of the table in bytes. Note that this is an approximate value.
  */
  TableSizeBytes?: number;
  /**
  * Schema of the table.
  */
  KeySchema: Array<KeySchemaElement>;
  /**
  * Time when the source table was created.
  */
  TableCreationDateTime: Date | string;
  /**
  * Read IOPs and Write IOPS on the table when the backup was created.
  */
  ProvisionedThroughput: ProvisionedThroughput;
  OnDemandThroughput?: OnDemandThroughput;
  /**
  * Number of items in the table. Note that this is an approximate value.
  */
  ItemCount?: number;
  /**
  * Controls how you are charged for read and write throughput and how you manage
  * capacity. This setting can be changed later.
  * PROVISIONED - Sets the read/write capacity mode to
  * PROVISIONED. We recommend using PROVISIONED for
  * predictable workloads.
  * PAY_PER_REQUEST - Sets the read/write capacity mode to
  * PAY_PER_REQUEST. We recommend using
  * PAY_PER_REQUEST for unpredictable workloads.
  */
  BillingMode?: BillingMode;
}
/**
 * Contains the details of the features enabled on the table when the backup was created.
 * For example, LSIs, GSIs, streams, TTL.
 */
export interface SourceTableFeatureDetails {
  /**
  * Represents the LSI properties for the table when the backup was created. It includes
  * the IndexName, KeySchema and Projection for the LSIs on the table at the time of backup.
  */
  LocalSecondaryIndexes?: Array<LocalSecondaryIndexInfo>;
  /**
  * Represents the GSI properties for the table when the backup was created. It includes
  * the IndexName, KeySchema, Projection, and ProvisionedThroughput for the GSIs on the
  * table at the time of backup.
  */
  GlobalSecondaryIndexes?: Array<GlobalSecondaryIndexInfo>;
  /**
  * Stream settings on the table when the backup was created.
  */
  StreamDescription?: StreamSpecification;
  /**
  * Time to Live settings on the table when the backup was created.
  */
  TimeToLiveDescription?: TimeToLiveDescription;
  /**
  * The description of the server-side encryption status on the table when the backup was
  * created.
  */
  SSEDescription?: SSEDescription;
}
/**
 * The description of the server-side encryption status on the specified table.
 */
export interface SSEDescription {
  /**
  * Represents the current state of server-side encryption. The only supported values
  * are:
  * ENABLED - Server-side encryption is enabled.
  * UPDATING - Server-side encryption is being updated.
  */
  Status?: SSEStatus;
  /**
  * Server-side encryption type. The only supported value is:
  * KMS - Server-side encryption that uses Key Management Service. The
  * key is stored in your account and is managed by KMS (KMS charges apply).
  */
  SSEType?: SSEType;
  /**
  * The KMS key ARN used for the KMS encryption.
  */
  KMSMasterKeyArn?: string;
  /**
  * Indicates the time, in UNIX epoch date format, when DynamoDB detected that
  * the table's KMS key was inaccessible. This attribute will automatically
  * be cleared when DynamoDB detects that the table's KMS key is accessible
  * again. DynamoDB will initiate the table archival process when table's KMS key remains inaccessible for more than seven days from this date.
  */
  InaccessibleEncryptionDateTime?: Date | string;
}
export type SSEEnabled = boolean;
/**
 * Represents the settings used to enable server-side encryption.
 */
export interface SSESpecification {
  /**
  * Indicates whether server-side encryption is done using an Amazon Web Services managed
  * key or an Amazon Web Services owned key. If enabled (true), server-side encryption type
  * is set to KMS and an Amazon Web Services managed key is used (KMS charges apply). If disabled (false) or not specified, server-side
  * encryption is set to Amazon Web Services owned key.
  */
  Enabled?: boolean;
  /**
  * Server-side encryption type. The only supported value is:
  * KMS - Server-side encryption that uses Key Management Service. The
  * key is stored in your account and is managed by KMS (KMS charges apply).
  */
  SSEType?: SSEType;
  /**
  * The KMS key that should be used for the KMS encryption.
  * To specify a key, use its key ID, Amazon Resource Name (ARN), alias name, or alias ARN.
  * Note that you should only provide this parameter if the key is different from the
  * default DynamoDB key alias/aws/dynamodb.
  */
  KMSMasterKeyId?: string;
}
export type SSEStatus = "ENABLING" | "ENABLED" | "DISABLING" | "DISABLED" | "UPDATING";
export type SSEType = "AES256" | "KMS";
export type StreamArn = string;
export type StreamEnabled = boolean;
/**
 * Represents the DynamoDB Streams configuration for a table in DynamoDB.
 */
export interface StreamSpecification {
  /**
  * Indicates whether DynamoDB Streams is enabled (true) or disabled (false) on the
  * table.
  */
  StreamEnabled: boolean;
  /**
  * When an item in the table is modified, StreamViewType determines what
  * information is written to the stream for this table. Valid values for
  * StreamViewType are:
  * KEYS_ONLY - Only the key attributes of the modified item are
  * written to the stream.
  * NEW_IMAGE - The entire item, as it appears after it was modified,
  * is written to the stream.
  * OLD_IMAGE - The entire item, as it appeared before it was modified,
  * is written to the stream.
  * NEW_AND_OLD_IMAGES - Both the new and the old item images of the
  * item are written to the stream.
  */
  StreamViewType?: StreamViewType;
}
export type StreamViewType = "NEW_IMAGE" | "OLD_IMAGE" | "NEW_AND_OLD_IMAGES" | "KEYS_ONLY";
export type DynamoDBString = string;
export type StringAttributeValue = string;
export type StringSetAttributeValue = Array<string>;
/**
 * A target table with the specified name already exists.
 */
export declare class TableAlreadyExistsException extends EffectData.TaggedError(
  "TableAlreadyExistsException",
)<{
  readonly message?: string;
}> {}
export type TableArn = string;
/**
 * Represents the auto scaling configuration for a global table.
 */
export interface TableAutoScalingDescription {
  /**
  * The name of the table.
  */
  TableName?: string;
  /**
  * The current state of the table:
  * CREATING - The table is being created.
  * UPDATING - The table is being updated.
  * DELETING - The table is being deleted.
  * ACTIVE - The table is ready for use.
  */
  TableStatus?: TableStatus;
  /**
  * Represents replicas of the global table.
  */
  Replicas?: Array<ReplicaAutoScalingDescription>;
}
export type TableClass = "STANDARD" | "STANDARD_INFREQUENT_ACCESS";
/**
 * Contains details of the table class.
 */
export interface TableClassSummary {
  /**
  * The table class of the specified table. Valid values are STANDARD and
  * STANDARD_INFREQUENT_ACCESS.
  */
  TableClass?: TableClass;
  /**
  * The date and time at which the table class was last updated.
  */
  LastUpdateDateTime?: Date | string;
}
export type TableCreationDateTime = Date | string;
/**
 * The parameters for the table created as part of the import operation.
 */
export interface TableCreationParameters {
  /**
  * The name of the table created as part of the import operation.
  */
  TableName: string;
  /**
  * The attributes of the table created as part of the import operation.
  */
  AttributeDefinitions: Array<AttributeDefinition>;
  /**
  * The primary key and option sort key of the table created as part of the import
  * operation.
  */
  KeySchema: Array<KeySchemaElement>;
  /**
  * The billing mode for provisioning the table created as part of the import operation.
  */
  BillingMode?: BillingMode;
  ProvisionedThroughput?: ProvisionedThroughput;
  OnDemandThroughput?: OnDemandThroughput;
  SSESpecification?: SSESpecification;
  /**
  * The Global Secondary Indexes (GSI) of the table to be created as part of the import
  * operation.
  */
  GlobalSecondaryIndexes?: Array<GlobalSecondaryIndex>;
}
/**
 * Represents the properties of a table.
 */
export interface TableDescription {
  /**
  * An array of AttributeDefinition objects. Each of these objects describes
  * one attribute in the table and index key schema.
  * Each AttributeDefinition object in this array is composed of:
  * AttributeName - The name of the attribute.
  * AttributeType - The data type for the attribute.
  */
  AttributeDefinitions?: Array<AttributeDefinition>;
  /**
  * The name of the table.
  */
  TableName?: string;
  /**
  * The primary key structure for the table. Each KeySchemaElement consists
  * of:
  * AttributeName - The name of the attribute.
  * KeyType - The role of the attribute:
  * HASH - partition key
  * RANGE - sort key
  * The partition key of an item is also known as its hash
  * attribute. The term "hash attribute" derives from DynamoDB's
  * usage of an internal hash function to evenly distribute data items across
  * partitions, based on their partition key values.
  * The sort key of an item is also known as its range
  * attribute. The term "range attribute" derives from the way
  * DynamoDB stores items with the same partition key physically close together,
  * in sorted order by the sort key value.
  * For more information about primary keys, see Primary Key in the Amazon DynamoDB Developer
  * Guide.
  */
  KeySchema?: Array<KeySchemaElement>;
  /**
  * The current state of the table:
  * CREATING - The table is being created.
  * UPDATING - The table/index configuration is being updated. The
  * table/index remains available for data operations when
  * UPDATING.
  * DELETING - The table is being deleted.
  * ACTIVE - The table is ready for use.
  * INACCESSIBLE_ENCRYPTION_CREDENTIALS - The KMS key
  * used to encrypt the table in inaccessible. Table operations may fail due to
  * failure to use the KMS key. DynamoDB will initiate the
  * table archival process when a table's KMS key remains
  * inaccessible for more than seven days. 
  * ARCHIVING - The table is being archived. Operations are not allowed
  * until archival is complete. 
  * ARCHIVED - The table has been archived. See the ArchivalReason for
  * more information.
  */
  TableStatus?: TableStatus;
  /**
  * The date and time when the table was created, in UNIX epoch time format.
  */
  CreationDateTime?: Date | string;
  /**
  * The provisioned throughput settings for the table, consisting of read and write
  * capacity units, along with data about increases and decreases.
  */
  ProvisionedThroughput?: ProvisionedThroughputDescription;
  /**
  * The total size of the specified table, in bytes. DynamoDB updates this value
  * approximately every six hours. Recent changes might not be reflected in this
  * value.
  */
  TableSizeBytes?: number;
  /**
  * The number of items in the specified table. DynamoDB updates this value approximately
  * every six hours. Recent changes might not be reflected in this value.
  */
  ItemCount?: number;
  /**
  * The Amazon Resource Name (ARN) that uniquely identifies the table.
  */
  TableArn?: string;
  /**
  * Unique identifier for the table for which the backup was created.
  */
  TableId?: string;
  /**
  * Contains the details for the read/write capacity mode.
  */
  BillingModeSummary?: BillingModeSummary;
  /**
  * Represents one or more local secondary indexes on the table. Each index is scoped to a
  * given partition key value. Tables with one or more local secondary indexes are subject
  * to an item collection size limit, where the amount of data within a given item
  * collection cannot exceed 10 GB. Each element is composed of:
  * IndexName - The name of the local secondary index.
  * KeySchema - Specifies the complete index key schema. The attribute
  * names in the key schema must be between 1 and 255 characters (inclusive). The
  * key schema must begin with the same partition key as the table.
  * Projection - Specifies attributes that are copied (projected) from
  * the table into the index. These are in addition to the primary key attributes
  * and index key attributes, which are automatically projected. Each attribute
  * specification is composed of:
  * ProjectionType - One of the following:
  * KEYS_ONLY - Only the index and primary keys are
  * projected into the index.
  * INCLUDE - Only the specified table attributes are
  * projected into the index. The list of projected attributes is in
  * NonKeyAttributes.
  * ALL - All of the table attributes are projected
  * into the index.
  * NonKeyAttributes - A list of one or more non-key attribute
  * names that are projected into the secondary index. The total count of
  * attributes provided in NonKeyAttributes, summed across all
  * of the secondary indexes, must not exceed 100. If you project the same
  * attribute into two different indexes, this counts as two distinct
  * attributes when determining the total. This limit only applies when you
  * specify the ProjectionType of INCLUDE. You still can
  * specify the ProjectionType of ALL to project all attributes
  * from the source table, even if the table has more than 100
  * attributes.
  * IndexSizeBytes - Represents the total size of the index, in bytes.
  * DynamoDB updates this value approximately every six hours. Recent changes might
  * not be reflected in this value.
  * ItemCount - Represents the number of items in the index. DynamoDB
  * updates this value approximately every six hours. Recent changes might not be
  * reflected in this value.
  * If the table is in the DELETING state, no information about indexes will
  * be returned.
  */
  LocalSecondaryIndexes?: Array<LocalSecondaryIndexDescription>;
  /**
  * The global secondary indexes, if any, on the table. Each index is scoped to a given
  * partition key value. Each element is composed of:
  * Backfilling - If true, then the index is currently in the
  * backfilling phase. Backfilling occurs only when a new global secondary index is
  * added to the table. It is the process by which DynamoDB populates the new index
  * with data from the table. (This attribute does not appear for indexes that were
  * created during a CreateTable operation.) 
  * You can delete an index that is being created during the
  * Backfilling phase when IndexStatus is set to
  * CREATING and Backfilling is true. You can't delete the index that
  * is being created when IndexStatus is set to CREATING and
  * Backfilling is false. (This attribute does not appear for
  * indexes that were created during a CreateTable operation.)
  * IndexName - The name of the global secondary index.
  * IndexSizeBytes - The total size of the global secondary index, in
  * bytes. DynamoDB updates this value approximately every six hours. Recent changes
  * might not be reflected in this value. 
  * IndexStatus - The current status of the global secondary
  * index:
  * CREATING - The index is being created.
  * UPDATING - The index is being updated.
  * DELETING - The index is being deleted.
  * ACTIVE - The index is ready for use.
  * ItemCount - The number of items in the global secondary index.
  * DynamoDB updates this value approximately every six hours. Recent changes might
  * not be reflected in this value. 
  * KeySchema - Specifies the complete index key schema. The attribute
  * names in the key schema must be between 1 and 255 characters (inclusive). The
  * key schema must begin with the same partition key as the table.
  * Projection - Specifies attributes that are copied (projected) from
  * the table into the index. These are in addition to the primary key attributes
  * and index key attributes, which are automatically projected. Each attribute
  * specification is composed of:
  * ProjectionType - One of the following:
  * KEYS_ONLY - Only the index and primary keys are
  * projected into the index.
  * INCLUDE - In addition to the attributes described
  * in KEYS_ONLY, the secondary index will include
  * other non-key attributes that you specify.
  * ALL - All of the table attributes are projected
  * into the index.
  * NonKeyAttributes - A list of one or more non-key attribute
  * names that are projected into the secondary index. The total count of
  * attributes provided in NonKeyAttributes, summed across all
  * of the secondary indexes, must not exceed 100. If you project the same
  * attribute into two different indexes, this counts as two distinct
  * attributes when determining the total. This limit only applies when you
  * specify the ProjectionType of INCLUDE. You still can
  * specify the ProjectionType of ALL to project all attributes
  * from the source table, even if the table has more than 100
  * attributes.
  * ProvisionedThroughput - The provisioned throughput settings for the
  * global secondary index, consisting of read and write capacity units, along with
  * data about increases and decreases. 
  * If the table is in the DELETING state, no information about indexes will
  * be returned.
  */
  GlobalSecondaryIndexes?: Array<GlobalSecondaryIndexDescription>;
  /**
  * The current DynamoDB Streams configuration for the table.
  */
  StreamSpecification?: StreamSpecification;
  /**
  * A timestamp, in ISO 8601 format, for this stream.
  * Note that LatestStreamLabel is not a unique identifier for the stream,
  * because it is possible that a stream from another table might have the same timestamp.
  * However, the combination of the following three elements is guaranteed to be
  * unique:
  * Amazon Web Services customer ID
  * Table name
  * StreamLabel
  */
  LatestStreamLabel?: string;
  /**
  * The Amazon Resource Name (ARN) that uniquely identifies the latest stream for this
  * table.
  */
  LatestStreamArn?: string;
  /**
  * Represents the version of global tables
  * in use, if the table is replicated across Amazon Web Services Regions.
  */
  GlobalTableVersion?: string;
  /**
  * Represents replicas of the table.
  */
  Replicas?: Array<ReplicaDescription>;
  /**
  * The witness Region and its current status in the MRSC global table. Only one witness
  * Region can be configured per MRSC global table.
  */
  GlobalTableWitnesses?: Array<GlobalTableWitnessDescription>;
  /**
  * Contains details for the restore.
  */
  RestoreSummary?: RestoreSummary;
  /**
  * The description of the server-side encryption status on the specified table.
  */
  SSEDescription?: SSEDescription;
  /**
  * Contains information about the table archive.
  */
  ArchivalSummary?: ArchivalSummary;
  /**
  * Contains details of the table class.
  */
  TableClassSummary?: TableClassSummary;
  /**
  * Indicates whether deletion protection is enabled (true) or disabled (false) on the
  * table.
  */
  DeletionProtectionEnabled?: boolean;
  /**
  * The maximum number of read and write units for the specified on-demand table. If you
  * use this parameter, you must specify MaxReadRequestUnits,
  * MaxWriteRequestUnits, or both.
  */
  OnDemandThroughput?: OnDemandThroughput;
  /**
  * Describes the warm throughput value of the base table.
  */
  WarmThroughput?: TableWarmThroughputDescription;
  /**
  * Indicates one of the following consistency modes for a global table:
  * EVENTUAL: Indicates that the global table is configured for
  * multi-Region eventual consistency (MREC).
  * STRONG: Indicates that the global table is configured for
  * multi-Region strong consistency (MRSC).
  * If you don't specify this field, the global table consistency mode defaults to
  * EVENTUAL. For more information about global tables consistency modes,
  * see 
  * Consistency modes in DynamoDB developer guide.
  */
  MultiRegionConsistency?: MultiRegionConsistency;
}
export type TableId = string;
/**
 * A target table with the specified name is either being created or deleted.
 */
export declare class TableInUseException extends EffectData.TaggedError(
  "TableInUseException",
)<{
  readonly message?: string;
}> {}
export type TableName = string;
export type TableNameList = Array<string>;
/**
 * A source table with the name TableName does not currently exist within
 * the subscriber's account or the subscriber is operating in the wrong Amazon Web Services
 * Region.
 */
export declare class TableNotFoundException extends EffectData.TaggedError(
  "TableNotFoundException",
)<{
  readonly message?: string;
}> {}
export type TableStatus = "CREATING" | "UPDATING" | "DELETING" | "ACTIVE" | "INACCESSIBLE_ENCRYPTION_CREDENTIALS" | "ARCHIVING" | "ARCHIVED" | "REPLICATION_NOT_AUTHORIZED";
/**
 * Represents the warm throughput value (in read units per second and write units per
 * second) of the table. Warm throughput is applicable for DynamoDB Standard-IA tables and
 * specifies the minimum provisioned capacity maintained for immediate data access.
 */
export interface TableWarmThroughputDescription {
  /**
  * Represents the base table's warm throughput value in read units per second.
  */
  ReadUnitsPerSecond?: number;
  /**
  * Represents the base table's warm throughput value in write units per second.
  */
  WriteUnitsPerSecond?: number;
  /**
  * Represents warm throughput value of the base table.
  */
  Status?: TableStatus;
}
/**
 * Describes a tag. A tag is a key-value pair. You can add up to 50 tags to a single
 * DynamoDB table. 
 * Amazon Web Services-assigned tag names and values are automatically assigned the
 * aws: prefix, which the user cannot assign. Amazon Web Services-assigned
 * tag names do not count towards the tag limit of 50. User-assigned tag names have the
 * prefix user: in the Cost Allocation Report. You cannot backdate the
 * application of a tag.
 * For an overview on tagging DynamoDB resources, see Tagging
 * for DynamoDB in the Amazon DynamoDB Developer
 * Guide.
 */
export interface Tag {
  /**
  * The key of the tag. Tag keys are case sensitive. Each DynamoDB table can
  * only have up to one tag with the same key. If you try to add an existing tag (same key),
  * the existing tag value will be updated to the new value.
  */
  Key: string;
  /**
  * The value of the tag. Tag values are case-sensitive and can be null.
  */
  Value: string;
}
export type TagKeyList = Array<string>;
export type TagKeyString = string;
export type TagList = Array<Tag>;

export interface TagResourceInput {
  /**
  * Identifies the Amazon DynamoDB resource to which tags should be added. This value is
  * an Amazon Resource Name (ARN).
  */
  ResourceArn: string;
  /**
  * The tags to be assigned to the Amazon DynamoDB resource.
  */
  Tags: Array<Tag>;
}
export type TagValueString = string;
/**
 * The request was denied due to request throttling. For detailed information about why
 * the request was throttled and the ARN of the impacted resource, find the ThrottlingReason field in the returned exception.
 */
export declare class ThrottlingException extends EffectData.TaggedError(
  "ThrottlingException",
)<{
  readonly message?: string;
    /**
   * A list of ThrottlingReason that
   * provide detailed diagnostic information about why the request was throttled.
   */
  readonly throttlingReasons?: Array<ThrottlingReason>;
}> {}
/**
 * Represents the specific reason why a DynamoDB request was throttled and the
 * ARN of the impacted resource. This helps identify exactly what resource is being throttled, 
 * what type of operation caused it, and why the throttling occurred.
 */
export interface ThrottlingReason {
  /**
  * The reason for throttling. The throttling reason follows a specific format:
  * ResourceType+OperationType+LimitType:
  * Resource Type (What is being throttled): Table or Index
  * Operation Type (What kind of operation): Read or Write
  * Limit Type (Why the throttling occurred):
  * ProvisionedThroughputExceeded: The request rate is
  * exceeding the provisioned throughput capacity (read or write capacity
  * units) configured for a table or a global secondary index (GSI) in
  * provisioned capacity mode.
  * AccountLimitExceeded: The request rate has caused a table
  * or global secondary index (GSI) in on-demand mode to exceed the per-table account-level service quotas for read/write
  * throughput in the current Amazon Web Services Region. 
  * KeyRangeThroughputExceeded: The request rate directed at
  * a specific partition key value has exceeded the internal partition-level throughput limits, indicating
  * uneven access patterns across the table's or GSI's key space.
  * MaxOnDemandThroughputExceeded: The request rate has
  * exceeded the configured maximum throughput limits set for a table or
  * index in on-demand capacity mode.
  * Examples of complete throttling reasons:
  * TableReadProvisionedThroughputExceeded
  * IndexWriteAccountLimitExceeded
  * This helps identify exactly what resource is being throttled, what type of operation
  * caused it, and why the throttling occurred.
  */
  reason?: string;
  /**
  * The Amazon Resource Name (ARN) of the DynamoDB table or index that experienced the
  * throttling event.
  */
  resource?: string;
}
export type ThrottlingReasonList = Array<ThrottlingReason>;
export type TimeRangeLowerBound = Date | string;
export type TimeRangeUpperBound = Date | string;
export type TimeToLiveAttributeName = string;
/**
 * The description of the Time to Live (TTL) status on the specified table.
 */
export interface TimeToLiveDescription {
  /**
  * The TTL status for the table.
  */
  TimeToLiveStatus?: TimeToLiveStatus;
  /**
  * The name of the TTL attribute for items in the table.
  */
  AttributeName?: string;
}
export type TimeToLiveEnabled = boolean;
/**
 * Represents the settings used to enable or disable Time to Live (TTL) for the specified
 * table.
 */
export interface TimeToLiveSpecification {
  /**
  * Indicates whether TTL is to be enabled (true) or disabled (false) on the table.
  */
  Enabled: boolean;
  /**
  * The name of the TTL attribute used to store the expiration time for items in the
  * table.
  */
  AttributeName: string;
}
export type TimeToLiveStatus = "ENABLING" | "DISABLING" | "ENABLED" | "DISABLED";
/**
 * Specifies an item to be retrieved as part of the transaction.
 */
export interface TransactGetItem {
  /**
  * Contains the primary key that identifies the item to get, together with the name of
  * the table that contains the item, and optionally the specific attributes of the item to
  * retrieve.
  */
  Get: Get;
}
export type TransactGetItemList = Array<TransactGetItem>;

export interface TransactGetItemsInput {
  /**
  * An ordered array of up to 100 TransactGetItem objects, each of which
  * contains a Get structure.
  */
  TransactItems: Array<TransactGetItem>;
  /**
  * A value of TOTAL causes consumed capacity information to be returned, and
  * a value of NONE prevents that information from being returned. No other
  * value is valid.
  */
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
}
export interface TransactGetItemsOutput {
  /**
  * If the ReturnConsumedCapacity value was TOTAL, this
  * is an array of ConsumedCapacity objects, one for each table addressed by
  * TransactGetItem objects in the TransactItems
  * parameter. These ConsumedCapacity objects report the read-capacity units
  * consumed by the TransactGetItems call in that table.
  */
  ConsumedCapacity?: Array<ConsumedCapacity>;
  /**
  * An ordered array of up to 100 ItemResponse objects, each of which
  * corresponds to the TransactGetItem object in the same position in the
  * TransactItems array. Each ItemResponse object
  * contains a Map of the name-value pairs that are the projected attributes of the
  * requested item.
  * If a requested item could not be retrieved, the corresponding
  * ItemResponse object is Null, or if the requested item has no projected
  * attributes, the corresponding ItemResponse object is an empty Map.
  */
  Responses?: Array<ItemResponse>;
}
/**
 * The entire transaction request was canceled.
 * DynamoDB cancels a TransactWriteItems request under the following
 * circumstances:
 * A condition in one of the condition expressions is not met.
 * A table in the TransactWriteItems request is in a different
 * account or region.
 * More than one action in the TransactWriteItems operation
 * targets the same item.
 * There is insufficient provisioned capacity for the transaction to be
 * completed.
 * An item size becomes too large (larger than 400 KB), or a local secondary
 * index (LSI) becomes too large, or a similar validation error occurs because of
 * changes made by the transaction.
 * There is a user error, such as an invalid data format.
 * There is an ongoing TransactWriteItems operation that
 * conflicts with a concurrent TransactWriteItems request. In this
 * case the TransactWriteItems operation fails with a
 * TransactionCanceledException. 
 * DynamoDB cancels a TransactGetItems request under the
 * following circumstances:
 * There is an ongoing TransactGetItems operation that conflicts
 * with a concurrent PutItem, UpdateItem,
 * DeleteItem or TransactWriteItems request. In this
 * case the TransactGetItems operation fails with a
 * TransactionCanceledException.
 * A table in the TransactGetItems request is in a different
 * account or region.
 * There is insufficient provisioned capacity for the transaction to be
 * completed.
 * There is a user error, such as an invalid data format.
 * If using Java, DynamoDB lists the cancellation reasons on the
 * CancellationReasons property. This property is not set for other
 * languages. Transaction cancellation reasons are ordered in the order of requested
 * items, if an item has no error it will have None code and
 * Null message.
 * Cancellation reason codes and possible error messages:
 * No Errors:
 * Code: None
 * Message: null
 * Conditional Check Failed:
 * Code: ConditionalCheckFailed
 * Message: The conditional request failed. 
 * Item Collection Size Limit Exceeded:
 * Code: ItemCollectionSizeLimitExceeded
 * Message: Collection size exceeded.
 * Transaction Conflict:
 * Code: TransactionConflict
 * Message: Transaction is ongoing for the item.
 * Provisioned Throughput Exceeded:
 * Code: ProvisionedThroughputExceeded
 * Messages:
 * The level of configured provisioned throughput for the
 * table was exceeded. Consider increasing your provisioning level
 * with the UpdateTable API.
 * This Message is received when provisioned throughput is
 * exceeded is on a provisioned DynamoDB
 * table.
 * The level of configured provisioned throughput for one or
 * more global secondary indexes of the table was exceeded.
 * Consider increasing your provisioning level for the
 * under-provisioned global secondary indexes with the UpdateTable
 * API.
 * This message is returned when provisioned throughput is
 * exceeded is on a provisioned GSI.
 * Throttling Error:
 * Code: ThrottlingError
 * Messages: 
 * Throughput exceeds the current capacity of your table or
 * index. DynamoDB is automatically scaling your table or
 * index so please try again shortly. If exceptions persist, check
 * if you have a hot key:
 * https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html.
 * This message is returned when writes get throttled on an
 * On-Demand table as DynamoDB is automatically
 * scaling the table.
 * Throughput exceeds the current capacity for one or more
 * global secondary indexes. DynamoDB is automatically
 * scaling your index so please try again shortly.
 * This message is returned when writes get throttled on an
 * On-Demand GSI as DynamoDB is automatically scaling
 * the GSI.
 * Validation Error:
 * Code: ValidationError
 * Messages: 
 * One or more parameter values were invalid.
 * The update expression attempted to update the secondary
 * index key beyond allowed size limits.
 * The update expression attempted to update the secondary
 * index key to unsupported type.
 * An operand in the update expression has an incorrect data
 * type.
 * Item size to update has exceeded the maximum allowed
 * size.
 * Number overflow. Attempting to store a number with
 * magnitude larger than supported range.
 * Type mismatch for attribute to update.
 * Nesting Levels have exceeded supported limits.
 * The document path provided in the update expression is
 * invalid for update.
 * The provided expression refers to an attribute that does
 * not exist in the item.
 */
export declare class TransactionCanceledException extends EffectData.TaggedError(
  "TransactionCanceledException",
)<{
  readonly Message?: string;
    /**
   * A list of cancellation reasons.
   */
  readonly CancellationReasons?: Array<CancellationReason>;
}> {}
/**
 * Operation was rejected because there is an ongoing transaction for the
 * item.
 */
export declare class TransactionConflictException extends EffectData.TaggedError(
  "TransactionConflictException",
)<{
  readonly message?: string;
}> {}
/**
 * The transaction with the given request token is already in progress.
 * Recommended Settings 
 * This is a general recommendation for handling the
 * TransactionInProgressException. These settings help ensure that the
 * client retries will trigger completion of the ongoing
 * TransactWriteItems request. 
 * Set clientExecutionTimeout to a value that allows at least one
 * retry to be processed after 5 seconds have elapsed since the first attempt for
 * the TransactWriteItems operation. 
 * Set socketTimeout to a value a little lower than the
 * requestTimeout setting. 
 * requestTimeout should be set based on the time taken for the
 * individual retries of a single HTTP request for your use case, but setting it to
 * 1 second or higher should work well to reduce chances of retries and
 * TransactionInProgressException errors. 
 * Use exponential backoff when retrying and tune backoff if needed. 
 * Assuming default retry policy, example timeout settings based on the guidelines
 * above are as follows: 
 * Example timeline:
 * 0-1000 first attempt
 * 1000-1500 first sleep/delay (default retry policy uses 500 ms as base delay
 * for 4xx errors)
 * 1500-2500 second attempt
 * 2500-3500 second sleep/delay (500 * 2, exponential backoff)
 * 3500-4500 third attempt
 * 4500-6500 third sleep/delay (500 * 2^2)
 * 6500-7500 fourth attempt (this can trigger inline recovery since 5 seconds
 * have elapsed since the first attempt reached TC)
 */
export declare class TransactionInProgressException extends EffectData.TaggedError(
  "TransactionInProgressException",
)<{
  readonly Message?: string;
}> {}
/**
 * A list of requests that can perform update, put, delete, or check operations on
 * multiple items in one or more tables atomically.
 */
export interface TransactWriteItem {
  /**
  * A request to perform a check item operation.
  */
  ConditionCheck?: ConditionCheck;
  /**
  * A request to perform a PutItem operation.
  */
  Put?: Put;
  /**
  * A request to perform a DeleteItem operation.
  */
  Delete?: Delete;
  /**
  * A request to perform an UpdateItem operation.
  */
  Update?: Update;
}
export type TransactWriteItemList = Array<TransactWriteItem>;

export interface TransactWriteItemsInput {
  /**
  * An ordered array of up to 100 TransactWriteItem objects, each of which
  * contains a ConditionCheck, Put, Update, or
  * Delete object. These can operate on items in different tables, but the
  * tables must reside in the same Amazon Web Services account and Region, and no two of them
  * can operate on the same item.
  */
  TransactItems: Array<TransactWriteItem>;
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
  /**
  * Determines whether item collection metrics are returned. If set to SIZE,
  * the response includes statistics about item collections (if any), that were modified
  * during the operation and are returned in the response. If set to NONE (the
  * default), no statistics are returned.
  */
  ReturnItemCollectionMetrics?: ReturnItemCollectionMetrics;
  /**
  * Providing a ClientRequestToken makes the call to
  * TransactWriteItems idempotent, meaning that multiple identical calls
  * have the same effect as one single call.
  * Although multiple identical calls using the same client request token produce the same
  * result on the server (no side effects), the responses to the calls might not be the
  * same. If the ReturnConsumedCapacity parameter is set, then the initial
  * TransactWriteItems call returns the amount of write capacity units
  * consumed in making the changes. Subsequent TransactWriteItems calls with
  * the same client token return the number of read capacity units consumed in reading the
  * item.
  * A client request token is valid for 10 minutes after the first request that uses it is
  * completed. After 10 minutes, any request with the same client token is treated as a new
  * request. Do not resubmit the same request with the same client token for more than 10
  * minutes, or the result might not be idempotent.
  * If you submit a request with the same client token but a change in other parameters
  * within the 10-minute idempotency window, DynamoDB returns an
  * IdempotentParameterMismatch exception.
  */
  ClientRequestToken?: string;
}
export interface TransactWriteItemsOutput {
  /**
  * The capacity units consumed by the entire TransactWriteItems operation.
  * The values of the list are ordered according to the ordering of the
  * TransactItems request parameter.
  */
  ConsumedCapacity?: Array<ConsumedCapacity>;
  /**
  * A list of tables that were processed by TransactWriteItems and, for each
  * table, information about any item collections that were affected by individual
  * UpdateItem, PutItem, or DeleteItem
  * operations.
  */
  ItemCollectionMetrics?: Record<string, Array<ItemCollectionMetrics>>;
}

export interface UntagResourceInput {
  /**
  * The DynamoDB resource that the tags will be removed from. This value is an Amazon
  * Resource Name (ARN).
  */
  ResourceArn: string;
  /**
  * A list of tag keys. Existing tags of the resource whose keys are members of this list
  * will be removed from the DynamoDB resource.
  */
  TagKeys: Array<string>;
}
/**
 * Represents a request to perform an UpdateItem operation.
 */
export interface Update {
  /**
  * The primary key of the item to be updated. Each element consists of an attribute name
  * and a value for that attribute.
  */
  Key: Record<string, AttributeValue>;
  /**
  * An expression that defines one or more attributes to be updated, the action to be
  * performed on them, and new value(s) for them.
  */
  UpdateExpression: string;
  /**
  * Name of the table for the UpdateItem request. You can also provide the
  * Amazon Resource Name (ARN) of the table in this parameter.
  */
  TableName: string;
  /**
  * A condition that must be satisfied in order for a conditional update to
  * succeed.
  */
  ConditionExpression?: string;
  /**
  * One or more substitution tokens for attribute names in an expression.
  */
  ExpressionAttributeNames?: Record<string, string>;
  /**
  * One or more values that can be substituted in an expression.
  */
  ExpressionAttributeValues?: Record<string, AttributeValue>;
  /**
  * Use ReturnValuesOnConditionCheckFailure to get the item attributes if the
  * Update condition fails. For
  * ReturnValuesOnConditionCheckFailure, the valid values are: NONE and
  * ALL_OLD.
  */
  ReturnValuesOnConditionCheckFailure?: ReturnValuesOnConditionCheckFailure;
}

export interface UpdateContinuousBackupsInput {
  /**
  * The name of the table. You can also provide the Amazon Resource Name (ARN) of the table in this
  * parameter.
  */
  TableName: string;
  /**
  * Represents the settings used to enable point in time recovery.
  */
  PointInTimeRecoverySpecification: PointInTimeRecoverySpecification;
}
export interface UpdateContinuousBackupsOutput {
  /**
  * Represents the continuous backups and point in time recovery settings on the
  * table.
  */
  ContinuousBackupsDescription?: ContinuousBackupsDescription;
}

export interface UpdateContributorInsightsInput {
  /**
  * The name of the table. You can also provide the Amazon Resource Name (ARN) of the table in this
  * parameter.
  */
  TableName: string;
  /**
  * The global secondary index name, if applicable.
  */
  IndexName?: string;
  /**
  * Represents the contributor insights action.
  */
  ContributorInsightsAction: ContributorInsightsAction;
  /**
  * Specifies whether to track all access and throttled events or throttled events only for
  * the DynamoDB table or index.
  */
  ContributorInsightsMode?: ContributorInsightsMode;
}
export interface UpdateContributorInsightsOutput {
  /**
  * The name of the table.
  */
  TableName?: string;
  /**
  * The name of the global secondary index, if applicable.
  */
  IndexName?: string;
  /**
  * The status of contributor insights
  */
  ContributorInsightsStatus?: ContributorInsightsStatus;
  /**
  * The updated mode of CloudWatch Contributor Insights that determines whether to monitor
  * all access and throttled events or to track throttled events exclusively.
  */
  ContributorInsightsMode?: ContributorInsightsMode;
}
export type UpdateExpression = string;
/**
 * Represents the new provisioned throughput settings to be applied to a global secondary
 * index.
 */
export interface UpdateGlobalSecondaryIndexAction {
  /**
  * The name of the global secondary index to be updated.
  */
  IndexName: string;
  /**
  * Represents the provisioned throughput settings for the specified global secondary
  * index.
  * For current minimum and maximum provisioned throughput values, see Service,
  * Account, and Table Quotas in the Amazon DynamoDB Developer
  * Guide.
  */
  ProvisionedThroughput?: ProvisionedThroughput;
  /**
  * Updates the maximum number of read and write units for the specified global secondary
  * index. If you use this parameter, you must specify MaxReadRequestUnits,
  * MaxWriteRequestUnits, or both.
  */
  OnDemandThroughput?: OnDemandThroughput;
  /**
  * Represents the warm throughput value of the new provisioned throughput settings to be
  * applied to a global secondary index.
  */
  WarmThroughput?: WarmThroughput;
}

export interface UpdateGlobalTableInput {
  /**
  * The global table name.
  */
  GlobalTableName: string;
  /**
  * A list of Regions that should be added or removed from the global table.
  */
  ReplicaUpdates: Array<ReplicaUpdate>;
}
export interface UpdateGlobalTableOutput {
  /**
  * Contains the details of the global table.
  */
  GlobalTableDescription?: GlobalTableDescription;
}

export interface UpdateGlobalTableSettingsInput {
  /**
  * The name of the global table
  */
  GlobalTableName: string;
  /**
  * The billing mode of the global table. If GlobalTableBillingMode is not
  * specified, the global table defaults to PROVISIONED capacity billing
  * mode.
  * PROVISIONED - We recommend using PROVISIONED for
  * predictable workloads. PROVISIONED sets the billing mode to Provisioned capacity mode.
  * PAY_PER_REQUEST - We recommend using PAY_PER_REQUEST
  * for unpredictable workloads. PAY_PER_REQUEST sets the billing mode
  * to On-demand capacity mode.
  */
  GlobalTableBillingMode?: BillingMode;
  /**
  * The maximum number of writes consumed per second before DynamoDB returns a
  * ThrottlingException.
  */
  GlobalTableProvisionedWriteCapacityUnits?: number;
  /**
  * Auto scaling settings for managing provisioned write capacity for the global
  * table.
  */
  GlobalTableProvisionedWriteCapacityAutoScalingSettingsUpdate?: AutoScalingSettingsUpdate;
  /**
  * Represents the settings of a global secondary index for a global table that will be
  * modified.
  */
  GlobalTableGlobalSecondaryIndexSettingsUpdate?: Array<GlobalTableGlobalSecondaryIndexSettingsUpdate>;
  /**
  * Represents the settings for a global table in a Region that will be modified.
  */
  ReplicaSettingsUpdate?: Array<ReplicaSettingsUpdate>;
}
export interface UpdateGlobalTableSettingsOutput {
  /**
  * The name of the global table.
  */
  GlobalTableName?: string;
  /**
  * The Region-specific settings for the global table.
  */
  ReplicaSettings?: Array<ReplicaSettingsDescription>;
}

/**
 * Represents the input of an UpdateItem operation.
 */
export interface UpdateItemInput {
  /**
  * The name of the table containing the item to update. You can also provide the
  * Amazon Resource Name (ARN) of the table in this parameter.
  */
  TableName: string;
  /**
  * The primary key of the item to be updated. Each element consists of an attribute name
  * and a value for that attribute.
  * For the primary key, you must provide all of the attributes. For example, with a
  * simple primary key, you only need to provide a value for the partition key. For a
  * composite primary key, you must provide values for both the partition key and the sort
  * key.
  */
  Key: Record<string, AttributeValue>;
  /**
  * This is a legacy parameter. Use UpdateExpression instead. For more
  * information, see AttributeUpdates in the Amazon DynamoDB Developer
  * Guide.
  */
  AttributeUpdates?: Record<string, AttributeValueUpdate>;
  /**
  * This is a legacy parameter. Use ConditionExpression instead. For more
  * information, see Expected in the Amazon DynamoDB Developer
  * Guide.
  */
  Expected?: Record<string, ExpectedAttributeValue>;
  /**
  * This is a legacy parameter. Use ConditionExpression instead. For more
  * information, see ConditionalOperator in the Amazon DynamoDB Developer
  * Guide.
  */
  ConditionalOperator?: ConditionalOperator;
  /**
  * Use ReturnValues if you want to get the item attributes as they appear
  * before or after they are successfully updated. For UpdateItem, the valid
  * values are:
  * NONE - If ReturnValues is not specified, or if its
  * value is NONE, then nothing is returned. (This setting is the
  * default for ReturnValues.)
  * ALL_OLD - Returns all of the attributes of the item, as they
  * appeared before the UpdateItem operation.
  * UPDATED_OLD - Returns only the updated attributes, as they appeared
  * before the UpdateItem operation.
  * ALL_NEW - Returns all of the attributes of the item, as they appear
  * after the UpdateItem operation.
  * UPDATED_NEW - Returns only the updated attributes, as they appear
  * after the UpdateItem operation.
  * There is no additional cost associated with requesting a return value aside from the
  * small network and processing overhead of receiving a larger response. No read capacity
  * units are consumed.
  * The values returned are strongly consistent.
  */
  ReturnValues?: ReturnValue;
  ReturnConsumedCapacity?: ReturnConsumedCapacity;
  /**
  * Determines whether item collection metrics are returned. If set to SIZE,
  * the response includes statistics about item collections, if any, that were modified
  * during the operation are returned in the response. If set to NONE (the
  * default), no statistics are returned.
  */
  ReturnItemCollectionMetrics?: ReturnItemCollectionMetrics;
  /**
  * An expression that defines one or more attributes to be updated, the action to be
  * performed on them, and new values for them.
  * The following action values are available for UpdateExpression.
  * SET - Adds one or more attributes and values to an item. If any of
  * these attributes already exist, they are replaced by the new values. You can
  * also use SET to add or subtract from an attribute that is of type
  * Number. For example: SET myNum = myNum + :val
  * SET supports the following functions:
  * if_not_exists (path, operand) - if the item does not
  * contain an attribute at the specified path, then
  * if_not_exists evaluates to operand; otherwise, it
  * evaluates to path. You can use this function to avoid overwriting an
  * attribute that may already be present in the item.
  * list_append (operand, operand) - evaluates to a list with a
  * new element added to it. You can append the new element to the start or
  * the end of the list by reversing the order of the operands.
  * These function names are case-sensitive.
  * REMOVE - Removes one or more attributes from an item.
  * ADD - Adds the specified value to the item, if the attribute does
  * not already exist. If the attribute does exist, then the behavior of
  * ADD depends on the data type of the attribute:
  * If the existing attribute is a number, and if Value is
  * also a number, then Value is mathematically added to the
  * existing attribute. If Value is a negative number, then it
  * is subtracted from the existing attribute.
  * If you use ADD to increment or decrement a number
  * value for an item that doesn't exist before the update, DynamoDB
  * uses 0 as the initial value.
  * Similarly, if you use ADD for an existing item to
  * increment or decrement an attribute value that doesn't exist before
  * the update, DynamoDB uses 0 as the initial value. For
  * example, suppose that the item you want to update doesn't have an
  * attribute named itemcount, but you decide to
  * ADD the number 3 to this attribute
  * anyway. DynamoDB will create the itemcount attribute,
  * set its initial value to 0, and finally add
  * 3 to it. The result will be a new
  * itemcount attribute in the item, with a value of
  * 3.
  * If the existing data type is a set and if Value is also a
  * set, then Value is added to the existing set. For example,
  * if the attribute value is the set [1,2], and the
  * ADD action specified [3], then the final
  * attribute value is [1,2,3]. An error occurs if an
  * ADD action is specified for a set attribute and the
  * attribute type specified does not match the existing set type. 
  * Both sets must have the same primitive data type. For example, if the
  * existing data type is a set of strings, the Value must also
  * be a set of strings.
  * The ADD action only supports Number and set data types. In
  * addition, ADD can only be used on top-level attributes, not
  * nested attributes.
  * DELETE - Deletes an element from a set.
  * If a set of values is specified, then those values are subtracted from the old
  * set. For example, if the attribute value was the set [a,b,c] and
  * the DELETE action specifies [a,c], then the final
  * attribute value is [b]. Specifying an empty set is an error.
  * The DELETE action only supports set data types. In addition,
  * DELETE can only be used on top-level attributes, not nested
  * attributes.
  * You can have many actions in a single expression, such as the following: SET
  * a=:value1, b=:value2 DELETE :value3, :value4, :value5
  * For more information on update expressions, see Modifying
  * Items and Attributes in the Amazon DynamoDB Developer
  * Guide.
  */
  UpdateExpression?: string;
  /**
  * A condition that must be satisfied in order for a conditional update to
  * succeed.
  * An expression can contain any of the following:
  * Functions: attribute_exists | attribute_not_exists | attribute_type |
  * contains | begins_with | size
  * These function names are case-sensitive.
  * Comparison operators: = | <> |
  * | = |
  * BETWEEN | IN 
  * Logical operators: AND | OR | NOT
  * For more information about condition expressions, see Specifying Conditions in the Amazon DynamoDB Developer
  * Guide.
  */
  ConditionExpression?: string;
  /**
  * One or more substitution tokens for attribute names in an expression. The following
  * are some use cases for using ExpressionAttributeNames:
  * To access an attribute whose name conflicts with a DynamoDB reserved
  * word.
  * To create a placeholder for repeating occurrences of an attribute name in an
  * expression.
  * To prevent special characters in an attribute name from being misinterpreted
  * in an expression.
  * Use the # character in an expression to dereference
  * an attribute name. For example, consider the following attribute name:
  * Percentile
  * The name of this attribute conflicts with a reserved word, so it cannot be used
  * directly in an expression. (For the complete list of reserved words, see Reserved Words in the Amazon DynamoDB Developer
  * Guide.) To work around this, you could specify the following for
  * ExpressionAttributeNames:
  * {"#P":"Percentile"}
  * You could then use this substitution in an expression, as in this example:
  * #P = :val
  * Tokens that begin with the : character are
  * expression attribute values, which are placeholders for the
  * actual value at runtime.
  * For more information about expression attribute names, see Specifying Item Attributes in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeNames?: Record<string, string>;
  /**
  * One or more values that can be substituted in an expression.
  * Use the : (colon) character in an expression to
  * dereference an attribute value. For example, suppose that you wanted to check whether
  * the value of the ProductStatus attribute was one of the following: 
  * Available | Backordered | Discontinued
  * You would first need to specify ExpressionAttributeValues as
  * follows:
  * { ":avail":{"S":"Available"}, ":back":{"S":"Backordered"},
  * ":disc":{"S":"Discontinued"} }
  * You could then use these values in an expression, such as this:
  * ProductStatus IN (:avail, :back, :disc)
  * For more information on expression attribute values, see Condition Expressions in the Amazon DynamoDB Developer
  * Guide.
  */
  ExpressionAttributeValues?: Record<string, AttributeValue>;
  /**
  * An optional parameter that returns the item attributes for an UpdateItem
  * operation that failed a condition check.
  * There is no additional cost associated with requesting a return value aside from the
  * small network and processing overhead of receiving a larger response. No read capacity
  * units are consumed.
  */
  ReturnValuesOnConditionCheckFailure?: ReturnValuesOnConditionCheckFailure;
}
/**
 * Represents the output of an UpdateItem operation.
 */
export interface UpdateItemOutput {
  /**
  * A map of attribute values as they appear before or after the UpdateItem
  * operation, as determined by the ReturnValues parameter.
  * The Attributes map is only present if the update was successful and
  * ReturnValues was specified as something other than NONE in
  * the request. Each element represents one attribute.
  */
  Attributes?: Record<string, AttributeValue>;
  /**
  * The capacity units consumed by the UpdateItem operation. The data
  * returned includes the total provisioned throughput consumed, along with statistics for
  * the table and any indexes involved in the operation. ConsumedCapacity is
  * only returned if the ReturnConsumedCapacity parameter was specified. For
  * more information, see Capacity unity consumption for write operations in the Amazon
  * DynamoDB Developer Guide.
  */
  ConsumedCapacity?: ConsumedCapacity;
  /**
  * Information about item collections, if any, that were affected by the
  * UpdateItem operation. ItemCollectionMetrics is only
  * returned if the ReturnItemCollectionMetrics parameter was specified. If the
  * table does not have any local secondary indexes, this information is not returned in the
  * response.
  * Each ItemCollectionMetrics element consists of:
  * ItemCollectionKey - The partition key value of the item collection.
  * This is the same as the partition key value of the item itself.
  * SizeEstimateRangeGB - An estimate of item collection size, in
  * gigabytes. This value is a two-element array containing a lower bound and an
  * upper bound for the estimate. The estimate includes the size of all the items in
  * the table, plus the size of all attributes projected into all of the local
  * secondary indexes on that table. Use this estimate to measure whether a local
  * secondary index is approaching its size limit.
  * The estimate is subject to change over time; therefore, do not rely on the
  * precision or accuracy of the estimate.
  */
  ItemCollectionMetrics?: ItemCollectionMetrics;
}
/**
 * Enables updating the configuration for Kinesis Streaming.
 */
export interface UpdateKinesisStreamingConfiguration {
  /**
  * Enables updating the precision of Kinesis data stream timestamp.
  */
  ApproximateCreationDateTimePrecision?: ApproximateCreationDateTimePrecision;
}

export interface UpdateKinesisStreamingDestinationInput {
  /**
  * The table name for the Kinesis streaming destination input. You can also provide the
  * ARN of the table in this parameter.
  */
  TableName: string;
  /**
  * The Amazon Resource Name (ARN) for the Kinesis stream input.
  */
  StreamArn: string;
  /**
  * The command to update the Kinesis stream configuration.
  */
  UpdateKinesisStreamingConfiguration?: UpdateKinesisStreamingConfiguration;
}
export interface UpdateKinesisStreamingDestinationOutput {
  /**
  * The table name for the Kinesis streaming destination output.
  */
  TableName?: string;
  /**
  * The ARN for the Kinesis stream input.
  */
  StreamArn?: string;
  /**
  * The status of the attempt to update the Kinesis streaming destination output.
  */
  DestinationStatus?: DestinationStatus;
  /**
  * The command to update the Kinesis streaming destination configuration.
  */
  UpdateKinesisStreamingConfiguration?: UpdateKinesisStreamingConfiguration;
}
/**
 * Represents a replica to be modified.
 */
export interface UpdateReplicationGroupMemberAction {
  /**
  * The Region where the replica exists.
  */
  RegionName: string;
  /**
  * The KMS key of the replica that should be used for KMS
  * encryption. To specify a key, use its key ID, Amazon Resource Name (ARN), alias name, or
  * alias ARN. Note that you should only provide this parameter if the key is different from
  * the default DynamoDB KMS key alias/aws/dynamodb.
  */
  KMSMasterKeyId?: string;
  /**
  * Replica-specific provisioned throughput. If not specified, uses the source table's
  * provisioned throughput settings.
  */
  ProvisionedThroughputOverride?: ProvisionedThroughputOverride;
  /**
  * Overrides the maximum on-demand throughput for the replica table.
  */
  OnDemandThroughputOverride?: OnDemandThroughputOverride;
  /**
  * Replica-specific global secondary index settings.
  */
  GlobalSecondaryIndexes?: Array<ReplicaGlobalSecondaryIndex>;
  /**
  * Replica-specific table class. If not specified, uses the source table's table
  * class.
  */
  TableClassOverride?: TableClass;
}

/**
 * Represents the input of an UpdateTable operation.
 */
export interface UpdateTableInput {
  /**
  * An array of attributes that describe the key schema for the table and indexes. If you
  * are adding a new global secondary index to the table, AttributeDefinitions
  * must include the key element(s) of the new index.
  */
  AttributeDefinitions?: Array<AttributeDefinition>;
  /**
  * The name of the table to be updated. You can also provide the Amazon Resource Name (ARN) of the table
  * in this parameter.
  */
  TableName: string;
  /**
  * Controls how you are charged for read and write throughput and how you manage
  * capacity. When switching from pay-per-request to provisioned capacity, initial
  * provisioned capacity values must be set. The initial provisioned capacity values are
  * estimated based on the consumed read and write capacity of your table and global
  * secondary indexes over the past 30 minutes.
  * PAY_PER_REQUEST - We recommend using PAY_PER_REQUEST
  * for most DynamoDB workloads. PAY_PER_REQUEST sets the billing mode
  * to On-demand capacity mode. 
  * PROVISIONED - We recommend using PROVISIONED for
  * steady workloads with predictable growth where capacity requirements can be
  * reliably forecasted. PROVISIONED sets the billing mode to Provisioned capacity mode.
  */
  BillingMode?: BillingMode;
  /**
  * The new provisioned throughput settings for the specified table or index.
  */
  ProvisionedThroughput?: ProvisionedThroughput;
  /**
  * An array of one or more global secondary indexes for the table. For each index in the
  * array, you can request one action:
  * Create - add a new global secondary index to the table.
  * Update - modify the provisioned throughput settings of an existing
  * global secondary index.
  * Delete - remove a global secondary index from the table.
  * You can create or delete only one global secondary index per UpdateTable
  * operation.
  * For more information, see Managing Global
  * Secondary Indexes in the Amazon DynamoDB Developer
  * Guide.
  */
  GlobalSecondaryIndexUpdates?: Array<GlobalSecondaryIndexUpdate>;
  /**
  * Represents the DynamoDB Streams configuration for the table.
  * You receive a ValidationException if you try to enable a stream on a
  * table that already has a stream, or if you try to disable a stream on a table that
  * doesn't have a stream.
  */
  StreamSpecification?: StreamSpecification;
  /**
  * The new server-side encryption settings for the specified table.
  */
  SSESpecification?: SSESpecification;
  /**
  * A list of replica update actions (create, delete, or update) for the table.
  */
  ReplicaUpdates?: Array<ReplicationGroupUpdate>;
  /**
  * The table class of the table to be updated. Valid values are STANDARD and
  * STANDARD_INFREQUENT_ACCESS.
  */
  TableClass?: TableClass;
  /**
  * Indicates whether deletion protection is to be enabled (true) or disabled (false) on
  * the table.
  */
  DeletionProtectionEnabled?: boolean;
  /**
  * Specifies the consistency mode for a new global table. This parameter is only valid
  * when you create a global table by specifying one or more Create actions in the ReplicaUpdates action list.
  * You can specify one of the following consistency modes:
  * EVENTUAL: Configures a new global table for multi-Region eventual
  * consistency (MREC). This is the default consistency mode for global
  * tables.
  * STRONG: Configures a new global table for multi-Region strong
  * consistency (MRSC).
  * If you don't specify this field, the global table consistency mode defaults to
  * EVENTUAL. For more information about global tables consistency modes,
  * see 
  * Consistency modes in DynamoDB developer guide.
  */
  MultiRegionConsistency?: MultiRegionConsistency;
  /**
  * A list of witness updates for a  MRSC global table. A witness provides a cost-effective
  * alternative to a full replica in a MRSC global table by maintaining replicated change
  * data written to global table replicas. You cannot perform read or write operations on a
  * witness. For each witness, you can request one action:
  * Create - add a new witness to the global table.
  * Delete - remove a witness from the global table.
  * You can create or delete only one witness per UpdateTable
  * operation.
  * For more information, see Multi-Region strong consistency (MRSC) in the Amazon DynamoDB
  * Developer Guide
  */
  GlobalTableWitnessUpdates?: Array<GlobalTableWitnessGroupUpdate>;
  /**
  * Updates the maximum number of read and write units for the specified table in
  * on-demand capacity mode. If you use this parameter, you must specify
  * MaxReadRequestUnits, MaxWriteRequestUnits, or both.
  */
  OnDemandThroughput?: OnDemandThroughput;
  /**
  * Represents the warm throughput (in read units per second and write units per second)
  * for updating a table.
  */
  WarmThroughput?: WarmThroughput;
}
/**
 * Represents the output of an UpdateTable operation.
 */
export interface UpdateTableOutput {
  /**
  * Represents the properties of the table.
  */
  TableDescription?: TableDescription;
}

export interface UpdateTableReplicaAutoScalingInput {
  /**
  * Represents the auto scaling settings of the global secondary indexes of the replica to
  * be updated.
  */
  GlobalSecondaryIndexUpdates?: Array<GlobalSecondaryIndexAutoScalingUpdate>;
  /**
  * The name of the global table to be updated. You can also provide the Amazon Resource Name (ARN) of the
  * table in this parameter.
  */
  TableName: string;
  ProvisionedWriteCapacityAutoScalingUpdate?: AutoScalingSettingsUpdate;
  /**
  * Represents the auto scaling settings of replicas of the table that will be
  * modified.
  */
  ReplicaUpdates?: Array<ReplicaAutoScalingUpdate>;
}
export interface UpdateTableReplicaAutoScalingOutput {
  /**
  * Returns information about the auto scaling settings of a table with replicas.
  */
  TableAutoScalingDescription?: TableAutoScalingDescription;
}

/**
 * Represents the input of an UpdateTimeToLive operation.
 */
export interface UpdateTimeToLiveInput {
  /**
  * The name of the table to be configured. You can also provide the Amazon Resource Name (ARN) of the
  * table in this parameter.
  */
  TableName: string;
  /**
  * Represents the settings used to enable or disable Time to Live for the specified
  * table.
  */
  TimeToLiveSpecification: TimeToLiveSpecification;
}
export interface UpdateTimeToLiveOutput {
  /**
  * Represents the output of an UpdateTimeToLive operation.
  */
  TimeToLiveSpecification?: TimeToLiveSpecification;
}
/**
 * Provides visibility into the number of read and write operations your table or
 * secondary index can instantaneously support. The settings can be modified using the
 * UpdateTable operation to meet the throughput requirements of an
 * upcoming peak event.
 */
export interface WarmThroughput {
  /**
  * Represents the number of read operations your base table can instantaneously
  * support.
  */
  ReadUnitsPerSecond?: number;
  /**
  * Represents the number of write operations your base table can instantaneously
  * support.
  */
  WriteUnitsPerSecond?: number;
}
export type WitnessStatus = "CREATING" | "DELETING" | "ACTIVE";
/**
 * Represents an operation to perform - either DeleteItem or
 * PutItem. You can only request one of these operations, not both, in a
 * single WriteRequest. If you do need to perform both of these operations,
 * you need to provide two separate WriteRequest objects.
 */
export interface WriteRequest {
  /**
  * A request to perform a PutItem operation.
  */
  PutRequest?: PutRequest;
  /**
  * A request to perform a DeleteItem operation.
  */
  DeleteRequest?: DeleteRequest;
}
export type WriteRequests = Array<WriteRequest>;
export declare namespace BatchExecuteStatement {
  export type Input = BatchExecuteStatementInput;
  export type Output = BatchExecuteStatementOutput;
  export type Error =
    | InternalServerError
    | RequestLimitExceeded
    | ThrottlingException
    | CommonAwsError;
}

export declare namespace BatchGetItem {
  export type Input = BatchGetItemInput;
  export type Output = BatchGetItemOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | ProvisionedThroughputExceededException
    | RequestLimitExceeded
    | ResourceNotFoundException
    | ThrottlingException
    | CommonAwsError;
}

export declare namespace BatchWriteItem {
  export type Input = BatchWriteItemInput;
  export type Output = BatchWriteItemOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | ItemCollectionSizeLimitExceededException
    | ProvisionedThroughputExceededException
    | ReplicatedWriteConflictException
    | RequestLimitExceeded
    | ResourceNotFoundException
    | ThrottlingException
    | CommonAwsError;
}

export declare namespace CreateBackup {
  export type Input = CreateBackupInput;
  export type Output = CreateBackupOutput;
  export type Error =
    | BackupInUseException
    | ContinuousBackupsUnavailableException
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | TableInUseException
    | TableNotFoundException
    | CommonAwsError;
}

export declare namespace CreateGlobalTable {
  export type Input = CreateGlobalTableInput;
  export type Output = CreateGlobalTableOutput;
  export type Error =
    | GlobalTableAlreadyExistsException
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | TableNotFoundException
    | CommonAwsError;
}

export declare namespace CreateTable {
  export type Input = CreateTableInput;
  export type Output = CreateTableOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | ResourceInUseException
    | CommonAwsError;
}

export declare namespace DeleteBackup {
  export type Input = DeleteBackupInput;
  export type Output = DeleteBackupOutput;
  export type Error =
    | BackupInUseException
    | BackupNotFoundException
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | CommonAwsError;
}

export declare namespace DeleteItem {
  export type Input = DeleteItemInput;
  export type Output = DeleteItemOutput;
  export type Error =
    | ConditionalCheckFailedException
    | InternalServerError
    | InvalidEndpointException
    | ItemCollectionSizeLimitExceededException
    | ProvisionedThroughputExceededException
    | ReplicatedWriteConflictException
    | RequestLimitExceeded
    | ResourceNotFoundException
    | ThrottlingException
    | TransactionConflictException
    | CommonAwsError;
}

export declare namespace DeleteResourcePolicy {
  export type Input = DeleteResourcePolicyInput;
  export type Output = DeleteResourcePolicyOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | PolicyNotFoundException
    | ResourceInUseException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace DeleteTable {
  export type Input = DeleteTableInput;
  export type Output = DeleteTableOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | ResourceInUseException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace DescribeBackup {
  export type Input = DescribeBackupInput;
  export type Output = DescribeBackupOutput;
  export type Error =
    | BackupNotFoundException
    | InternalServerError
    | InvalidEndpointException
    | CommonAwsError;
}

export declare namespace DescribeContinuousBackups {
  export type Input = DescribeContinuousBackupsInput;
  export type Output = DescribeContinuousBackupsOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | TableNotFoundException
    | CommonAwsError;
}

export declare namespace DescribeContributorInsights {
  export type Input = DescribeContributorInsightsInput;
  export type Output = DescribeContributorInsightsOutput;
  export type Error =
    | InternalServerError
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace DescribeEndpoints {
  export type Input = DescribeEndpointsRequest;
  export type Output = DescribeEndpointsResponse;
  export type Error =
    | CommonAwsError;
}

export declare namespace DescribeExport {
  export type Input = DescribeExportInput;
  export type Output = DescribeExportOutput;
  export type Error =
    | ExportNotFoundException
    | InternalServerError
    | LimitExceededException
    | CommonAwsError;
}

export declare namespace DescribeGlobalTable {
  export type Input = DescribeGlobalTableInput;
  export type Output = DescribeGlobalTableOutput;
  export type Error =
    | GlobalTableNotFoundException
    | InternalServerError
    | InvalidEndpointException
    | CommonAwsError;
}

export declare namespace DescribeGlobalTableSettings {
  export type Input = DescribeGlobalTableSettingsInput;
  export type Output = DescribeGlobalTableSettingsOutput;
  export type Error =
    | GlobalTableNotFoundException
    | InternalServerError
    | InvalidEndpointException
    | CommonAwsError;
}

export declare namespace DescribeImport {
  export type Input = DescribeImportInput;
  export type Output = DescribeImportOutput;
  export type Error =
    | ImportNotFoundException
    | CommonAwsError;
}

export declare namespace DescribeKinesisStreamingDestination {
  export type Input = DescribeKinesisStreamingDestinationInput;
  export type Output = DescribeKinesisStreamingDestinationOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace DescribeLimits {
  export type Input = DescribeLimitsInput;
  export type Output = DescribeLimitsOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | CommonAwsError;
}

export declare namespace DescribeTable {
  export type Input = DescribeTableInput;
  export type Output = DescribeTableOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace DescribeTableReplicaAutoScaling {
  export type Input = DescribeTableReplicaAutoScalingInput;
  export type Output = DescribeTableReplicaAutoScalingOutput;
  export type Error =
    | InternalServerError
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace DescribeTimeToLive {
  export type Input = DescribeTimeToLiveInput;
  export type Output = DescribeTimeToLiveOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace DisableKinesisStreamingDestination {
  export type Input = KinesisStreamingDestinationInput;
  export type Output = KinesisStreamingDestinationOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | ResourceInUseException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace EnableKinesisStreamingDestination {
  export type Input = KinesisStreamingDestinationInput;
  export type Output = KinesisStreamingDestinationOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | ResourceInUseException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace ExecuteStatement {
  export type Input = ExecuteStatementInput;
  export type Output = ExecuteStatementOutput;
  export type Error =
    | ConditionalCheckFailedException
    | DuplicateItemException
    | InternalServerError
    | ItemCollectionSizeLimitExceededException
    | ProvisionedThroughputExceededException
    | RequestLimitExceeded
    | ResourceNotFoundException
    | ThrottlingException
    | TransactionConflictException
    | CommonAwsError;
}

export declare namespace ExecuteTransaction {
  export type Input = ExecuteTransactionInput;
  export type Output = ExecuteTransactionOutput;
  export type Error =
    | IdempotentParameterMismatchException
    | InternalServerError
    | ProvisionedThroughputExceededException
    | RequestLimitExceeded
    | ResourceNotFoundException
    | ThrottlingException
    | TransactionCanceledException
    | TransactionInProgressException
    | CommonAwsError;
}

export declare namespace ExportTableToPointInTime {
  export type Input = ExportTableToPointInTimeInput;
  export type Output = ExportTableToPointInTimeOutput;
  export type Error =
    | ExportConflictException
    | InternalServerError
    | InvalidExportTimeException
    | LimitExceededException
    | PointInTimeRecoveryUnavailableException
    | TableNotFoundException
    | CommonAwsError;
}

export declare namespace GetItem {
  export type Input = GetItemInput;
  export type Output = GetItemOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | ProvisionedThroughputExceededException
    | RequestLimitExceeded
    | ResourceNotFoundException
    | ThrottlingException
    | CommonAwsError;
}

export declare namespace GetResourcePolicy {
  export type Input = GetResourcePolicyInput;
  export type Output = GetResourcePolicyOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | PolicyNotFoundException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace ImportTable {
  export type Input = ImportTableInput;
  export type Output = ImportTableOutput;
  export type Error =
    | ImportConflictException
    | LimitExceededException
    | ResourceInUseException
    | CommonAwsError;
}

export declare namespace ListBackups {
  export type Input = ListBackupsInput;
  export type Output = ListBackupsOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | CommonAwsError;
}

export declare namespace ListContributorInsights {
  export type Input = ListContributorInsightsInput;
  export type Output = ListContributorInsightsOutput;
  export type Error =
    | InternalServerError
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace ListExports {
  export type Input = ListExportsInput;
  export type Output = ListExportsOutput;
  export type Error =
    | InternalServerError
    | LimitExceededException
    | CommonAwsError;
}

export declare namespace ListGlobalTables {
  export type Input = ListGlobalTablesInput;
  export type Output = ListGlobalTablesOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | CommonAwsError;
}

export declare namespace ListImports {
  export type Input = ListImportsInput;
  export type Output = ListImportsOutput;
  export type Error =
    | LimitExceededException
    | CommonAwsError;
}

export declare namespace ListTables {
  export type Input = ListTablesInput;
  export type Output = ListTablesOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | CommonAwsError;
}

export declare namespace ListTagsOfResource {
  export type Input = ListTagsOfResourceInput;
  export type Output = ListTagsOfResourceOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace PutItem {
  export type Input = PutItemInput;
  export type Output = PutItemOutput;
  export type Error =
    | ConditionalCheckFailedException
    | InternalServerError
    | InvalidEndpointException
    | ItemCollectionSizeLimitExceededException
    | ProvisionedThroughputExceededException
    | ReplicatedWriteConflictException
    | RequestLimitExceeded
    | ResourceNotFoundException
    | ThrottlingException
    | TransactionConflictException
    | CommonAwsError;
}

export declare namespace PutResourcePolicy {
  export type Input = PutResourcePolicyInput;
  export type Output = PutResourcePolicyOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | PolicyNotFoundException
    | ResourceInUseException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace Query {
  export type Input = QueryInput;
  export type Output = QueryOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | ProvisionedThroughputExceededException
    | RequestLimitExceeded
    | ResourceNotFoundException
    | ThrottlingException
    | CommonAwsError;
}

export declare namespace RestoreTableFromBackup {
  export type Input = RestoreTableFromBackupInput;
  export type Output = RestoreTableFromBackupOutput;
  export type Error =
    | BackupInUseException
    | BackupNotFoundException
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | TableAlreadyExistsException
    | TableInUseException
    | CommonAwsError;
}

export declare namespace RestoreTableToPointInTime {
  export type Input = RestoreTableToPointInTimeInput;
  export type Output = RestoreTableToPointInTimeOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | InvalidRestoreTimeException
    | LimitExceededException
    | PointInTimeRecoveryUnavailableException
    | TableAlreadyExistsException
    | TableInUseException
    | TableNotFoundException
    | CommonAwsError;
}

export declare namespace Scan {
  export type Input = ScanInput;
  export type Output = ScanOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | ProvisionedThroughputExceededException
    | RequestLimitExceeded
    | ResourceNotFoundException
    | ThrottlingException
    | CommonAwsError;
}

export declare namespace TagResource {
  export type Input = TagResourceInput;
  export type Output = {};
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | ResourceInUseException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace TransactGetItems {
  export type Input = TransactGetItemsInput;
  export type Output = TransactGetItemsOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | ProvisionedThroughputExceededException
    | RequestLimitExceeded
    | ResourceNotFoundException
    | ThrottlingException
    | TransactionCanceledException
    | CommonAwsError;
}

export declare namespace TransactWriteItems {
  export type Input = TransactWriteItemsInput;
  export type Output = TransactWriteItemsOutput;
  export type Error =
    | IdempotentParameterMismatchException
    | InternalServerError
    | InvalidEndpointException
    | ProvisionedThroughputExceededException
    | RequestLimitExceeded
    | ResourceNotFoundException
    | ThrottlingException
    | TransactionCanceledException
    | TransactionInProgressException
    | CommonAwsError;
}

export declare namespace UntagResource {
  export type Input = UntagResourceInput;
  export type Output = {};
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | ResourceInUseException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace UpdateContinuousBackups {
  export type Input = UpdateContinuousBackupsInput;
  export type Output = UpdateContinuousBackupsOutput;
  export type Error =
    | ContinuousBackupsUnavailableException
    | InternalServerError
    | InvalidEndpointException
    | TableNotFoundException
    | CommonAwsError;
}

export declare namespace UpdateContributorInsights {
  export type Input = UpdateContributorInsightsInput;
  export type Output = UpdateContributorInsightsOutput;
  export type Error =
    | InternalServerError
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace UpdateGlobalTable {
  export type Input = UpdateGlobalTableInput;
  export type Output = UpdateGlobalTableOutput;
  export type Error =
    | GlobalTableNotFoundException
    | InternalServerError
    | InvalidEndpointException
    | ReplicaAlreadyExistsException
    | ReplicaNotFoundException
    | TableNotFoundException
    | CommonAwsError;
}

export declare namespace UpdateGlobalTableSettings {
  export type Input = UpdateGlobalTableSettingsInput;
  export type Output = UpdateGlobalTableSettingsOutput;
  export type Error =
    | GlobalTableNotFoundException
    | IndexNotFoundException
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | ReplicaNotFoundException
    | ResourceInUseException
    | CommonAwsError;
}

export declare namespace UpdateItem {
  export type Input = UpdateItemInput;
  export type Output = UpdateItemOutput;
  export type Error =
    | ConditionalCheckFailedException
    | InternalServerError
    | InvalidEndpointException
    | ItemCollectionSizeLimitExceededException
    | ProvisionedThroughputExceededException
    | ReplicatedWriteConflictException
    | RequestLimitExceeded
    | ResourceNotFoundException
    | ThrottlingException
    | TransactionConflictException
    | CommonAwsError;
}

export declare namespace UpdateKinesisStreamingDestination {
  export type Input = UpdateKinesisStreamingDestinationInput;
  export type Output = UpdateKinesisStreamingDestinationOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | ResourceInUseException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace UpdateTable {
  export type Input = UpdateTableInput;
  export type Output = UpdateTableOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | ResourceInUseException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace UpdateTableReplicaAutoScaling {
  export type Input = UpdateTableReplicaAutoScalingInput;
  export type Output = UpdateTableReplicaAutoScalingOutput;
  export type Error =
    | InternalServerError
    | LimitExceededException
    | ResourceInUseException
    | ResourceNotFoundException
    | CommonAwsError;
}

export declare namespace UpdateTimeToLive {
  export type Input = UpdateTimeToLiveInput;
  export type Output = UpdateTimeToLiveOutput;
  export type Error =
    | InternalServerError
    | InvalidEndpointException
    | LimitExceededException
    | ResourceInUseException
    | ResourceNotFoundException
    | CommonAwsError;
}

