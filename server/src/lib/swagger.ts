import swaggerJsDoc from 'swagger-jsdoc';

export default function getSwaggerSpec(port: number) {
    const swaggerDefinition: swaggerJsDoc.SwaggerDefinition = {
        openapi: '3.0.0',
        info: {
            title: 'SpyApp API',
            version: '1.0.0',
            description: 'API documentation for the SpyApp multiplayer word game',
            contact: {
                name: 'Benjamin',
                url: 'https://github.com/BenjaminDerProgrammierer/',
                email: 'mountain-hertz-dab@duck.com'
            },
            // termsOfService: '',
            license: {
                name: 'The Unlicense',
                url: 'https://unlicense.org/'
            }
        },
        servers: [
            {
                url: `/`,
                description: 'Current server',
            },
            {
                url: `http://localhost:${port}`,
                description: 'Local server',
            }
        ],
        tags: [
            {
                name: 'Health',
                description: 'Endpoints related to health checks'
            },
            {
                name: 'Games',
                description: 'Endpoints for viewing games'
            },
            {
                name: 'Admin',
                description: 'Endpoints for admin operations'
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
                        hostName: {
                            type: 'string',
                            description: 'Name of the host player'
                        },
                        playerCount: {
                            type: 'integer',
                            description: 'Number of players in the game'
                        },
                        players: {
                            type: 'array',
                            items: {
                                $ref: '#/components/schemas/Player'
                            }
                        },
                        status: {
                            type: 'string',
                            enum: ['waiting', 'playing', 'finished'],
                            description: 'Current game status'
                        },
                        word: {
                            type: 'string',
                            description: 'The current word for the game round'
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Game creation timestamp'
                        }
                    }
                },
                Player: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Unique player identifier'
                        },
                        name: {
                            type: 'string',
                            description: 'Player name'
                        },
                        role: {
                            type: 'string',
                            enum: ['spy', 'regular'],
                            description: 'Player role in the game'
                        }
                    }
                },
                Word: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'Word ID'
                        },
                        word: {
                            type: 'string',
                            description: 'The word itself'
                        },
                        category: {
                            type: 'string',
                            description: 'Word category'
                        },
                        hints: {
                            type: 'array',
                            items: {
                                type: 'string'
                            },
                            description: 'Array of hint words'
                        }
                    }
                },
                GameSettings: {
                    type: 'object',
                    properties: {
                        showHintsToRegularUsers: {
                            type: 'boolean',
                            description: 'Whether regular players can see hints'
                        },
                        minPlayersToStart: {
                            type: 'integer',
                            minimum: 2,
                            description: 'Minimum number of players required to start a game'
                        }
                    }
                },
                Error: {
                    type: 'object',
                    properties: {
                        success: {
                            type: 'boolean',
                            example: false
                        },
                        error: {
                            type: 'string',
                            description: 'Error message'
                        }
                    }
                }
            },
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    description: 'Enter your admin password as the bearer token'
                }
            }
        }
    }

    return swaggerJsDoc({
        definition: swaggerDefinition,
        apis: ['./src/routes/*.ts', './src/index.ts']
    });
}