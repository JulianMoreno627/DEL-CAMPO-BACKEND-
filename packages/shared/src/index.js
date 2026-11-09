/**
 * @del-campo/shared: common utilities WITHOUT business logic.
 * Every microservice and the gateway use them; no service imports code from another service.
 */
export { DomainError, NotFound, InvalidTransition, VersionConflict, ServiceUnavailable } from './errors.js';
export { Entity } from './model/Entity.js';
export { Repository, InMemoryRepository } from './repository/Repository.js';
export { PostgresRepository } from './repository/PostgresRepository.js';
export { createPool, parseDatabaseUrl, waitForDatabase, runSqlFile } from './db/postgres.js';
export { SERVICES, grpcPort, grpcAddress, grpcDeadlineMs, databaseUrl, uploadsDir } from './config.js';
export { runWithContext, currentContext } from './context.js';
export { loadContract, PROTO_DIR } from './grpc/protoLoader.js';
export { GrpcServer, unary, contextFromCall } from './grpc/GrpcServer.js';
export { GrpcClient } from './grpc/GrpcClient.js';
export { toGrpcError, fromGrpcError, grpcCodeFor } from './grpc/errorMapping.js';
export { HealthService, ServingStatus, checkHealth, closeHealthClients } from './grpc/health.js';
export { SessionToken } from './auth/SessionToken.js';
export { startService } from './runtime.js';
