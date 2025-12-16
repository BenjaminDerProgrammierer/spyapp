export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SpyApp Game API',
      version: '1.0.0',
      description: 'API documentation for the SpyApp multiplayer word game',
      contact: {
        name: 'Developer'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      schemas: {
        Game: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique game identifier'
            },
            hostId: {
              type: 'string',
              description: 'Host player ID'
            },
            players: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  role: { type: 'string', enum: ['spy', 'regular'] }
                }
              }
            },
            status: {
              type: 'string',
              enum: ['waiting', 'playing', 'finished']
            },
            word: {
              type: 'string',
              description: 'The current word for the game round'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Player: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['spy', 'regular'] }
          }
        }
      },
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your password as the token value for authorized endpoints'
        }
      }
    }
  },
  apis: ['./src/routes/*.ts']
};
