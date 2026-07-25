import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { redisConnection, WORKFLOW_QUEUE_NAME } from './queue.js';

const prisma = new PrismaClient();

interface WorkflowJobData {
  executionId: string;
  workflowId: string;
  payload: any;
}

console.log('⚙️ Iniciando Worker Engine de Flujos de Trabajo...');

export const workflowWorker = new Worker<WorkflowJobData>(
  WORKFLOW_QUEUE_NAME,
  async (job: Job<WorkflowJobData>) => {
    const { executionId, workflowId, payload } = job.data;
    console.log(`\n▶️ Procesando trabajo ID ${job.id} para Workflow: ${workflowId}`);

    // 1. Actualizar estado de ejecución a RUNNING
    await prisma.execution.update({
      where: { id: executionId },
      data: { status: 'RUNNING' },
    });

    try {
      // 2. Obtener el flujo y sus nodos configurados desde PostgreSQL
      const workflow = await prisma.workflow.findUnique({
        where: { id: workflowId },
        include: { nodes: true, edges: true },
      });

      if (!workflow) {
        throw new Error(`Workflow con ID ${workflowId} no encontrado.`);
      }

      const executionLogs: string[] = [];
      executionLogs.push(`[${new Date().toISOString()}] Trabajo recibido. Payload: ${JSON.stringify(payload)}`);

      // 3. Simular o ejecutar la secuencia de nodos
      for (const node of workflow.nodes) {
        executionLogs.push(`[${new Date().toISOString()}] Ejecutando nodo: ${node.label} (${node.type})`);
        
        // Aquí se pueden agregar conectores reales (envío de HTTP, formateo de JSON, etc.)
        if (node.type === 'HTTP_REQUEST') {
          executionLogs.push(`[${new Date().toISOString()}] Petición HTTP simulada enviada con éxito.`);
        }
      }

      executionLogs.push(`[${new Date().toISOString()}] Flujo finalizado con éxito.`);

      // 4. Marcar ejecución como COMPLETED
      await prisma.execution.update({
        where: { id: executionId },
        data: {
          status: 'COMPLETED',
          logs: executionLogs,
          finishedAt: new Date(),
        },
      });

      console.log(`✅ Flujo ${workflowId} completado con éxito.`);
    } catch (error: any) {
      console.error(`❌ Error al ejecutar el flujo ${workflowId}:`, error.message);

      // En caso de fallo, guardar el log y marcar como FAILED
      await prisma.execution.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          error: error.message,
          finishedAt: new Date(),
        },
      });

      throw error; // Lanzar error para que BullMQ registre el reintento
    }
  },
  { connection: redisConnection }
);