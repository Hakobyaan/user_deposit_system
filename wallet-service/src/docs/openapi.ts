const responseEnvelope = (dataSchema: Record<string, unknown>) => ({
  type:       'object',
  properties: {
    ok:     { type: 'boolean', example: true },
    status: { type: 'integer', example: 200 },
    data:   dataSchema,
  },
});

const errorEnvelope = {
  type:       'object',
  properties: {
    ok:      { type: 'boolean', example: false },
    status:  { type: 'integer', example: 400 },
    message: { type: 'string' },
  },
};

export const openApiSpec = {
  openapi: '3.0.3',
  info:    {
    title:       'Wallet Service API',
    version:     '1.0.0',
    description: 'Deposits, transaction history and report generation for the demo wallet system.',
  },
  servers:    [{ url: '/' }],
  tags:       [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Accounts' },
    { name: 'Deposits' },
    { name: 'Transfers' },
    { name: 'Transactions' },
    { name: 'Reports' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type:         'http',
        scheme:       'bearer',
        bearerFormat: 'JWT',
        description:  'Token returned by POST /auth/login. Demo-only: username `user<id>` (e.g. "user1"), password equal to the username.',
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags:        ['Auth'],
        summary:     'Demo login',
        description: 'Not real authentication — username is `user<id>` for a seeded account (e.g. "user1"), password equals the username.',
        requestBody: {
          required: true,
          content:  {
            'application/json': {
              schema: {
                type:       'object',
                required:   ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'user1' },
                  password: { type: 'string', example: 'user1' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Logged in',
            content:     {
              'application/json': {
                schema: responseEnvelope({
                  type:       'object',
                  properties: {
                    token:  { type: 'string' },
                    userId: { type: 'integer' },
                  },
                }),
              },
            },
          },
          401: {
            description: 'Invalid username or password', content: {
              'application/json': { schema: errorEnvelope }
            }
          },
        },
      },
    },
    '/accounts/me': {
      get: {
        tags:       ['Accounts'],
        summary:    'Your own balance',
        security:   [{ bearerAuth: [] }],
        responses:  {
          200: {
            description: 'Current balance',
            content:     {
              'application/json': {
                schema: responseEnvelope({
                  type:       'object',
                  properties: {
                    userId:  { type: 'integer' },
                    balance: { type: 'string' },
                  },
                }),
              },
            },
          },
          401: {
            description: 'Missing/invalid token', content: {
              'application/json': { schema: errorEnvelope }
            }
          },
        },
      },
    },
    '/transfer': {
      post: {
        tags:        ['Transfers'],
        summary:     'Transfer money to another user',
        description: 'Debits the logged-in user (from the token) and credits toUserId, atomically.',
        security:    [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content:  {
            'application/json': {
              schema: {
                type:       'object',
                required:   ['toUserId', 'amount'],
                properties: {
                  toUserId: { type: 'integer', example: 2 },
                  amount:   { type: 'number', example: 25 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Transfer completed',
            content:     {
              'application/json': {
                schema: responseEnvelope({
                  type:       'object',
                  properties: {
                    transactionId: { type: 'integer' },
                    fromUserId:    { type: 'integer' },
                    toUserId:      { type: 'integer' },
                    amount:        { type: 'number' },
                    fromBalance:   { type: 'string' },
                    toBalance:     { type: 'string' },
                  },
                }),
              },
            },
          },
          400: {
            description: 'Validation error or insufficient balance', content: {
              'application/json': { schema: errorEnvelope }
            }
          },
          401: {
            description: 'Missing/invalid token', content: {
              'application/json': { schema: errorEnvelope }
            }
          },
          404: {
            description: 'Unknown toUserId', content: {
              'application/json': { schema: errorEnvelope }
            }
          },
        },
      },
    },
    '/health': {
      get: {
        tags:      ['Health'],
        summary:   'Liveness check',
        responses: {
          200: {
            description: 'Service is up',
            content:     {
              'application/json': {
                schema: {
                  type: 'object', properties: {
                    ok: { type: 'boolean', example: true }
                  }
                },
              },
            },
          },
        },
      },
    },
    '/deposit': {
      post: {
        tags:        ['Deposits'],
        summary:     'Create a deposit',
        description: 'Idempotent (via Idempotency-Key) and rate-limited to 10 requests/minute per userId.',
        parameters:  [
          {
            name:     'Idempotency-Key',
            in:       'header',
            required: true,
            schema:   { type: 'string' },
            example:  'demo-1',
          },
        ],
        requestBody: {
          required: true,
          content:  {
            'application/json': {
              schema: {
                type:       'object',
                required:   ['userId', 'amount'],
                properties: {
                  userId: { type: 'integer', example: 1 },
                  amount: { type: 'number', example: 100 },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Deposit created',
            content:     {
              'application/json': {
                schema: responseEnvelope({
                  type:       'object',
                  properties: {
                    transactionId: { type: 'integer' },
                    userId:        { type: 'integer' },
                    amount:        { type: 'number' },
                    balance:       { type: 'string' },
                  },
                }),
              },
            },
          },
          400: {
            description: 'Validation error', content: {
              'application/json': { schema: errorEnvelope }
            }
          },
          404: {
            description: 'Unknown userId', content: {
              'application/json': { schema: errorEnvelope }
            }
          },
          409: {
            description: 'Same Idempotency-Key still processing', content: {
              'application/json': { schema: errorEnvelope }
            }
          },
          429: {
            description: 'Rate limit exceeded', content: {
              'application/json': { schema: errorEnvelope }
            }
          },
        },
      },
    },
    '/transactions/{userId}': {
      get: {
        tags:       ['Transactions'],
        summary:    'Paginated transaction history',
        description: 'Page 1 is served from a 30s Redis cache.',
        parameters: [
          {
            name: 'userId', in: 'path', required: true, schema: { type: 'integer' }
          },
          {
            name: 'page', in: 'query', schema: { type: 'integer', default: 1 }
          },
          {
            name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }
          },
        ],
        responses: {
          200: {
            description: 'Transaction page',
            content:     {
              'application/json': {
                schema: responseEnvelope({
                  type:       'object',
                  properties: {
                    total: { type: 'integer' },
                    page:  { type: 'integer' },
                    limit: { type: 'integer' },
                    transactions: {
                      type:  'array',
                      items: { type: 'object' },
                    },
                  },
                }),
              },
            },
          },
        },
      },
    },
    '/transactions/{userId}/export': {
      get: {
        tags:       ['Transactions'],
        summary:    'Stream full transaction history as CSV',
        parameters: [
          {
            name: 'userId', in: 'path', required: true, schema: { type: 'integer' }
          },
        ],
        responses: {
          200: {
            description: 'CSV file',
            content:     {
              'text/csv': {
                schema: {
                  type: 'string', format: 'binary'
                }
              },
            },
          },
        },
      },
    },
    '/reports/generate': {
      post: {
        tags:        ['Reports'],
        summary:     'Kick off async PDF report generation',
        requestBody: {
          required: true,
          content:  {
            'application/json': {
              schema: {
                type:       'object',
                required:   ['userId'],
                properties: {
                  userId: { type: 'integer', example: 1 }
                },
              },
            },
          },
        },
        responses: {
          202: {
            description: 'Report generation started',
            content:     {
              'application/json': {
                schema: responseEnvelope({
                  type:       'object',
                  properties: {
                    reportId: { type: 'string' }
                  },
                }),
              },
            },
          },
        },
      },
    },
    '/reports/{reportId}/status': {
      get: {
        tags:       ['Reports'],
        summary:    'Poll report generation status',
        parameters: [
          {
            name: 'reportId', in: 'path', required: true, schema: { type: 'string' }
          },
        ],
        responses: {
          200: {
            description: 'Report status',
            content:     {
              'application/json': {
                schema: responseEnvelope({
                  type:       'object',
                  properties: {
                    reportId: { type: 'string' },
                    status:   { type: 'string', enum: ['processing', 'done', 'failed'] },
                    message:  { type: 'string', nullable: true },
                  },
                }),
              },
            },
          },
          404: {
            description: 'Unknown reportId', content: {
              'application/json': { schema: errorEnvelope }
            }
          },
        },
      },
    },
    '/reports/{reportId}/download': {
      get: {
        tags:       ['Reports'],
        summary:    'Download the generated PDF',
        parameters: [
          {
            name: 'reportId', in: 'path', required: true, schema: { type: 'string' }
          },
        ],
        responses: {
          200: {
            description: 'PDF file',
            content:     {
              'application/pdf': {
                schema: {
                  type: 'string', format: 'binary'
                }
              },
            },
          },
          400: {
            description: 'Report not ready yet', content: {
              'application/json': { schema: errorEnvelope }
            }
          },
          404: {
            description: 'Unknown reportId', content: {
              'application/json': { schema: errorEnvelope }
            }
          },
        },
      },
    },
  },
};
