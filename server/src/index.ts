import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { workflowQueue } from './queue.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Healthcheck endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'online', service: 'Event-Driven Workflow Engine' });
});

// 1. Crear un nuevo Workflow
app.post('/api/workflows', async (req, res) => {
  try {
    const { name, description, nodes, edges } = req.body;

    const workflow = await prisma.workflow.create({
      data: {
        name: name || 'Nuevo Flujo de Trabajo',
        description,
        nodes: {
          create: nodes || [
            { type: 'WEBHOOK', label: 'Webhook Trigger', positionX: 100, positionY: 100 },
            { type: 'HTTP_REQUEST', label: 'Send Alert', positionX: 300, positionY: 100 },
          ],
        },
        edges: { create: edges || [] },
      },
      include: { nodes: true, edges: true },
    });

    res.status(201).json(workflow);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Obtener lista de Workflows
app.get('/api/workflows', async (_req, res) => {
  const workflows = await prisma.workflow.findMany({
    include: { nodes: true, _count: { select: { executions: true } } },
  });
  res.json(workflows);
});

// 3. Receptor de Webhooks (Disparador de Eventos)
app.post('/api/webhooks/:workflowId', async (req, res) => {
  const { workflowId } = req.params;
  const payload = req.body;

  try {
    // Validar que el workflow existe
    const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
    if (!workflow || !workflow.active) {
      return res.status(404).json({ error: 'Workflow no encontrado o inactivo.' });
    }

    // Registrar ejecución en estado PENDING
    const execution = await prisma.execution.create({
      data: {
        workflowId,
        status: 'PENDING',
        triggerData: payload || {},
        logs: ['[PENDING] Evento ingresado a la cola de procesamiento.'],
      },
    });

    // Encolar el trabajo en Redis vía BullMQ
    await workflowQueue.add('execute-workflow', {
      executionId: execution.id,
      workflowId,
      payload,
    });

    // Responder de inmediato (Procesamiento asíncrono no bloqueante)
    return res.status(202).json({
      message: 'Evento recibido y encolado para procesamiento.',
      executionId: execution.id,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API Server escuchando en http://localhost:${PORT}`);
});