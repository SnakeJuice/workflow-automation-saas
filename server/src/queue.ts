import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

// Conexión reutilizable a Redis
export const redisConnection = new Redis({
  host: redisHost,
  port: redisPort,
  maxRetriesPerRequest: null,
});

// Nombre de la cola principal de flujos de trabajo
export const WORKFLOW_QUEUE_NAME = 'workflow-execution-queue';

// Instancia de la cola BullMQ
export const workflowQueue = new Queue(WORKFLOW_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Reintentos automáticos si falla un trabajo
    backoff: {
      type: 'exponential',
      delay: 2000, // Espera 2s antes de reintentar
    },
    removeOnComplete: 100, // Conservar los últimos 100 trabajos completados en Redis
    removeOnFail: 200,
  },
});