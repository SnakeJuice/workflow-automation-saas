import { useState, useEffect, useCallback } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react";
import type {
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Play, Plus, Zap, CheckCircle2 } from "lucide-react";
import axios from "axios";

const API_BASE = "http://localhost:4000/api";

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  positionX: number;
  positionY: number;
  config?: Record<string, unknown>;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes?: WorkflowNode[];
}

interface ExecutionResponse {
  message: string;
  executionId: string;
}

export default function App() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [lastExecution, setLastExecution] = useState<ExecutionResponse | null>(
    null,
  );
  const [loading, setLoading] = useState<boolean>(false);

  // Seleccionar un flujo y mapear sus nodos a React Flow
  const selectWorkflow = useCallback((wf: Workflow) => {
    setActiveWorkflow(wf);
    const rawNodes = wf.nodes || [];

    const flowNodes: Node[] = rawNodes.map((n) => ({
      id: String(n.id),
      position: {
        x: Number(n.positionX) || 100,
        y: Number(n.positionY) || 100,
      },
      data: { label: `${n.label || "Node"} (${n.type || "STEP"})` },
      style: {
        background: n.type === "WEBHOOK" ? "#1e1b4b" : "#0f172a",
        color: "#f8fafc",
        border: `1px solid ${n.type === "WEBHOOK" ? "#6366f1" : "#334155"}`,
        borderRadius: "12px",
        padding: "12px 16px",
        fontWeight: "600",
        fontSize: "13px",
      },
    }));
    setNodes(flowNodes);
    setEdges([]);
  }, []);

  // Función explícita para recargar la lista de workflows cuando sea necesario
  const reloadWorkflows = async () => {
    try {
      const res = await axios.get<Workflow[]>(`${API_BASE}/workflows`);
      const data = res.data || [];
      setWorkflows(data);
      return data;
    } catch (err) {
      console.error("Error cargando workflows:", err);
      return [];
    }
  };

  // Carga inicial asíncrona segura dentro del Effect
  useEffect(() => {
    let isSubscribed = true;

    const loadInitialData = async () => {
      try {
        const res = await axios.get<Workflow[]>(`${API_BASE}/workflows`);
        const data = res.data || [];
        if (isSubscribed) {
          setWorkflows(data);
          if (data.length > 0) {
            selectWorkflow(data[0]);
          }
        }
      } catch (err) {
        console.error("Error en carga inicial:", err);
      }
    };

    loadInitialData();

    return () => {
      isSubscribed = false;
    };
  }, [selectWorkflow]);

  const createWorkflow = async () => {
    try {
      const res = await axios.post<Workflow>(`${API_BASE}/workflows`, {
        name: `Workflow #${workflows.length + 1}`,
      });
      const updatedList = await reloadWorkflows();
      const created = res.data || updatedList[updatedList.length - 1];
      if (created) selectWorkflow(created);
    } catch (err) {
      console.error("Error creando workflow:", err);
    }
  };

  const triggerWebhook = async () => {
    if (!activeWorkflow) return;
    setLoading(true);
    try {
      const res = await axios.post<ExecutionResponse>(
        `${API_BASE}/webhooks/${activeWorkflow.id}`,
        {
          source: "Visual Builder UI",
          timestamp: new Date().toISOString(),
        },
      );
      setLastExecution(res.data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Error desconocido";
      alert(`Error al disparar Webhook: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [],
  );

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar - Lista de Workflows */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-indigo-600/20 p-2 rounded-xl border border-indigo-500/30">
              <Zap className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Flow Engine</h1>
              <p className="text-xs text-slate-400">Event-Driven SaaS</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Mis Flujos
            </span>
            <button
              onClick={createWorkflow}
              className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
              title="Crear Nuevo Flujo"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            {workflows.map((wf) => (
              <button
                key={wf.id}
                onClick={() => selectWorkflow(wf)}
                className={`w-full text-left p-3 rounded-xl border text-sm transition ${
                  activeWorkflow?.id === wf.id
                    ? "bg-indigo-600/15 border-indigo-500/50 text-indigo-300 font-semibold"
                    : "bg-slate-800/40 border-slate-800/80 text-slate-400 hover:bg-slate-800"
                }`}
              >
                {wf.name}
              </button>
            ))}
          </div>
        </div>

        {/* Endpoint Webhook */}
        {activeWorkflow && (
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl mt-4">
            <p className="text-xs font-semibold text-slate-400 mb-2">
              Endpoint de Webhook (POST):
            </p>
            <code className="text-[11px] bg-slate-950 p-2 rounded border border-slate-800 block text-indigo-300 break-all font-mono">
              http://localhost:4000/api/webhooks/{activeWorkflow.id}
            </code>
          </div>
        )}
      </aside>

      {/* Main Canvas */}
      <main className="flex-1 relative flex flex-col h-full overflow-hidden">
        {/* Navbar */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/30 px-6 flex items-center justify-between z-10 backdrop-blur shrink-0">
          <div>
            <h2 className="font-bold text-slate-200">
              {activeWorkflow?.name || "Selecciona un Flujo"}
            </h2>
            <p className="text-xs text-slate-400">
              Arrastra y conecta nodos para definir la secuencia de eventos
            </p>
          </div>

          {activeWorkflow && (
            <button
              onClick={triggerWebhook}
              disabled={loading}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-xl text-sm transition shadow-lg shadow-emerald-900/20"
            >
              <Play className="w-4 h-4 fill-current" />
              {loading ? "Encolando..." : "Probar Evento (Simular Webhook)"}
            </button>
          )}
        </header>

        {/* Lienzo con React Flow */}
        <div className="flex-1 relative w-full h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            colorMode="dark"
            fitView
          >
            <Controls className="!bg-slate-900 !border-slate-800 !text-slate-100" />
            <Background color="#334155" gap={20} size={1} />
          </ReactFlow>
        </div>

        {/* Toast de Evento Encolado */}
        {lastExecution && (
          <div className="absolute bottom-6 right-6 bg-slate-900/95 border border-slate-800 backdrop-blur p-4 rounded-2xl shadow-2xl max-w-md z-20">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h4 className="font-semibold text-sm text-slate-200">
                Evento Encolado en Redis
              </h4>
            </div>
            <p className="text-xs text-slate-400 mb-2">
              {lastExecution.message}
            </p>
            <div className="text-[11px] font-mono bg-slate-950 p-2 rounded border border-slate-800/80 text-slate-300">
              Execution ID: {lastExecution.executionId}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
