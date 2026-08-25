import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

export const registry = new OpenAPIRegistry();

// Signaling route schemas
const createPollSchema = z.object({
  creatorAddress: z.string().regex(/^G[A-Z2-7]{55}$/, "invalid creator address"),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1),
  choices: z.array(z.string().trim().min(1).max(100)).min(2).max(10),
  snapshotLedger: z.coerce.number().int().positive(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
});

const pollResponseSchema = z.object({
  id: z.number().int().min(1),
  creatorAddress: z.string(),
  title: z.string(),
  description: z.string(),
  choices: z.array(z.string()),
  snapshotLedger: z.number().int(),
  startTime: z.string(),
  endTime: z.string(),
  finalized: z.boolean(),
  resultHash: z.string().nullable(),
  anchoredTxHash: z.string().nullable(),
  createdAt: z.string(),
});

const castVoteSchema = z.object({
  choiceIndex: z.coerce.number().int().min(0),
  nonce: z.string().min(1).max(64),
  signature: z.string().trim().min(1),
});

const voteResponseSchema = z.object({
  ok: z.boolean(),
});

const resultsResponseSchema = z.object({
  finalized: z.boolean(),
  resultHash: z.string().optional(),
  anchoredTxHash: z.string().optional(),
  choices: z.array(z.string()),
  totals: z.array(z.string()),
  totalVotes: z.number().int(),
  totalWeight: z.string(),
});

const votesListResponseSchema = z.object({
  votes: z.array(z.object({
    voter_address: z.string(),
    choice_index: z.number().int(),
    nonce: z.string(),
    signature: z.string(),
    voting_power: z.number().int().nullable(),
    created_at: z.string(),
  })),
  pagination: z.object({
    limit: z.number().int(),
    offset: z.number().int(),
    hasMore: z.boolean(),
  }),
});

// Register signaling endpoints
registry.registerPath({
  method: 'post',
  path: '/signaling/polls',
  description: 'Create a temperature-check poll',
  request: { body: { content: { 'application/json': { schema: createPollSchema } } } },
  responses: {
    201: { description: 'Poll created', content: { 'application/json': { schema: pollResponseSchema } } },
    403: { description: 'Creator voting power below threshold' },
    400: { description: 'Invalid input' },
    500: { description: 'Internal server error' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/signaling/polls',
  description: 'List all signaling polls',
  parameters: [
    { name: 'status', in: 'query', schema: z.enum(['active', 'closed']).optional() },
  ],
  responses: {
    200: { description: 'List of polls', content: { 'application/json': { schema: z.array(pollResponseSchema) } } },
    500: { description: 'Internal server error' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/signaling/polls/{id}',
  description: 'Get a specific signaling poll',
  parameters: [{ name: 'id', in: 'path', required: true, schema: z.number().int() }],
  responses: {
    200: { description: 'Poll details', content: { 'application/json': { schema: pollResponseSchema } } },
    404: { description: 'Poll not found' },
    500: { description: 'Internal server error' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/signaling/polls/{id}/vote',
  description: 'Cast a gasless vote on a signaling poll',
  parameters: [{ name: 'id', in: 'path', required: true, schema: z.number().int() }],
  request: { body: { content: { 'application/json': { schema: castVoteSchema } } } },
  responses: {
    201: { description: 'Vote recorded', content: { 'application/json': { schema: voteResponseSchema } } },
    400: { description: 'Invalid input or poll not open' },
    404: { description: 'Poll not found' },
    409: { description: 'Address has already voted' },
    500: { description: 'Internal server error' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/signaling/polls/{id}/results',
  description: 'Get live or finalized poll results',
  parameters: [{ name: 'id', in: 'path', required: true, schema: z.number().int() }],
  responses: {
    200: { description: 'Poll results', content: { 'application/json': { schema: resultsResponseSchema } } },
    404: { description: 'Poll not found' },
    500: { description: 'Internal server error' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/signaling/polls/{id}/votes',
  description: 'Get paginated vote list for auditability',
  parameters: [
    { name: 'id', in: 'path', required: true, schema: z.number().int() },
    { name: 'limit', in: 'query', schema: z.coerce.number().int().min(1).max(200).optional().default(50) },
    { name: 'offset', in: 'query', schema: z.coerce.number().int().min(0).optional().default(0) },
  ],
  responses: {
    200: { description: 'Paginated vote list', content: { 'application/json': { schema: votesListResponseSchema } } },
    404: { description: 'Poll not found' },
    500: { description: 'Internal server error' },
  },
});

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'NebGov Backend API',
      description: 'REST API for NebGov backend services',
    },
    servers: [{ url: '/api' }],
  });
}
