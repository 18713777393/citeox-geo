import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { verifyAuthToken } from "./auth.js";

export type DashboardRefreshProgressPayload = {
  taskId: string;
  progress: number;
  step: number;
  totalSteps: number;
  message: string;
  status: string;
  estimatedRemainingSeconds?: number;
};

const subscriptions = new Map<string, Set<WebSocket>>();
let dashboardWebSocketServer: WebSocketServer | null = null;

export function attachDashboardRefreshServer(httpServer: HttpServer) {
  if (dashboardWebSocketServer) return dashboardWebSocketServer;

  dashboardWebSocketServer = new WebSocketServer({
    server: httpServer,
    path: "/api/v1/dashboard/ws"
  });

  dashboardWebSocketServer.on("connection", async (socket, request) => {
    try {
      const url = new URL(request.url ?? "", "http://127.0.0.1");
      const token = url.searchParams.get("token") ?? "";
      const taskId = url.searchParams.get("taskId") ?? "";
      if (!token || !taskId) {
        socket.close(1008, "Missing token or taskId.");
        return;
      }

      await verifyAuthToken(token);
      subscribeToTask(taskId, socket);
      socket.send(JSON.stringify({
        type: "dashboard.refresh.connected",
        taskId
      }));
    } catch {
      socket.close(1008, "Unauthorized.");
    }
  });

  return dashboardWebSocketServer;
}

export function broadcastDashboardRefreshProgress(payload: DashboardRefreshProgressPayload) {
  const clients = subscriptions.get(payload.taskId);
  if (!clients?.size) return;

  const message = JSON.stringify({
    type: "dashboard.refresh.progress",
    ...payload
  });

  for (const socket of clients) {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
    }
  }
}

function subscribeToTask(taskId: string, socket: WebSocket) {
  const clients = subscriptions.get(taskId) ?? new Set<WebSocket>();
  clients.add(socket);
  subscriptions.set(taskId, clients);

  socket.on("close", () => {
    clients.delete(socket);
    if (!clients.size) {
      subscriptions.delete(taskId);
    }
  });
}
