import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { verifyAuthToken } from "./auth.js";

type DiagnosisProgressPayload = {
  diagnosisTaskId: string;
  progress: number;
  currentStep: string | null;
  status: string;
  brandProjectId?: string;
};

const subscriptions = new Map<string, Set<WebSocket>>();
let diagnosisWebSocketServer: WebSocketServer | null = null;

export function attachDiagnosisProgressServer(httpServer: HttpServer) {
  if (diagnosisWebSocketServer) return diagnosisWebSocketServer;

  diagnosisWebSocketServer = new WebSocketServer({
    server: httpServer,
    path: "/api/v1/diagnosis/ws"
  });

  diagnosisWebSocketServer.on("connection", async (socket, request) => {
    try {
      const url = new URL(request.url ?? "", "http://127.0.0.1");
      const token = url.searchParams.get("token") ?? "";
      const diagnosisTaskId = url.searchParams.get("diagnosisTaskId") ?? url.searchParams.get("taskId") ?? "";
      if (!token || !diagnosisTaskId) {
        socket.close(1008, "Missing token or diagnosisTaskId.");
        return;
      }

      await verifyAuthToken(token);
      subscribeToDiagnosisTask(diagnosisTaskId, socket);
      socket.send(JSON.stringify({
        type: "diagnosis.connected",
        diagnosisTaskId
      }));
    } catch {
      socket.close(1008, "Unauthorized.");
    }
  });

  return diagnosisWebSocketServer;
}

export function broadcastDiagnosisProgress(payload: DiagnosisProgressPayload) {
  const clients = subscriptions.get(payload.diagnosisTaskId);
  if (!clients?.size) return;

  const message = JSON.stringify({
    type: "diagnosis.progress",
    diagnosisTaskId: payload.diagnosisTaskId,
    brandProjectId: payload.brandProjectId,
    progress: payload.progress,
    currentStep: payload.currentStep,
    status: payload.status
  });

  for (const socket of clients) {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
    }
  }
}

function subscribeToDiagnosisTask(diagnosisTaskId: string, socket: WebSocket) {
  const clients = subscriptions.get(diagnosisTaskId) ?? new Set<WebSocket>();
  clients.add(socket);
  subscriptions.set(diagnosisTaskId, clients);

  socket.on("close", () => {
    clients.delete(socket);
    if (!clients.size) {
      subscriptions.delete(diagnosisTaskId);
    }
  });
}
