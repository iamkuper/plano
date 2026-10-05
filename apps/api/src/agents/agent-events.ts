import { Injectable } from "@nestjs/common";
import type { NotificationType } from "@prisma/client";
import type { Locale } from "@plano/shared";

// Something happened on a card that an agent should react to.
export interface AgentEvent {
  workspaceId: string;
  agentId: string;
  cardId: string;
  actorId: string | null;
  type: NotificationType;
  text?: string | null;
  // Language of whoever caused the event: the agent's own comments follow it.
  locale: Locale;
}

// A tiny in-process bus. Notifications publish here and the agent runner
// listens, so neither module has to import the other (cards → notifications →
// agents → cards would be a cycle).
@Injectable()
export class AgentEvents {
  private listeners: ((e: AgentEvent) => void)[] = [];
  subscribe(fn: (e: AgentEvent) => void) {
    this.listeners.push(fn);
  }
  publish(e: AgentEvent) {
    for (const fn of this.listeners) fn(e);
  }
}
