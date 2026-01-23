/**
 * Notebook Service - handles notebook CRUD operations
 */

import type { Notebook, NotebookSummary, ChatConfig } from "../../types";
import { RPC_IDS, CONSTANTS } from "../../config";
import type { RpcTransport } from "../transport";
import {
  decodeNotebooks,
  decodeNotebook,
  decodeCreatedNotebook,
  decodeNotebookSummary,
} from "../codec";

export class NotebookService {
  constructor(private transport: RpcTransport) {}

  async list(): Promise<Notebook[]> {
    const params = [null, 1, null, [2]];
    const result = await this.transport.call(RPC_IDS.LIST_NOTEBOOKS, params);
    return decodeNotebooks(result);
  }

  async create(title = ""): Promise<Notebook | null> {
    const params = [title, null, null, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];
    const result = await this.transport.call(RPC_IDS.CREATE_NOTEBOOK, params);
    return decodeCreatedNotebook(result, title);
  }

  async get(notebookId: string): Promise<{ title: string; sources: { id: string; title: string }[] } | null> {
    const result = await this.transport.call(
      RPC_IDS.GET_NOTEBOOK,
      [notebookId, null, [2], null, 0],
      { path: `/notebook/${notebookId}` }
    );
    return decodeNotebook(result);
  }

  async getRaw(notebookId: string): Promise<unknown> {
    return this.transport.call(
      RPC_IDS.GET_NOTEBOOK,
      [notebookId, null, [2], null, 0],
      { path: `/notebook/${notebookId}` }
    );
  }

  async delete(notebookId: string): Promise<boolean> {
    const params = [[notebookId], [2]];
    const result = await this.transport.call(RPC_IDS.DELETE_NOTEBOOK, params);
    return result !== null;
  }

  async rename(notebookId: string, newTitle: string): Promise<boolean> {
    const params = [notebookId, [[null, null, null, [null, newTitle]]]];
    const result = await this.transport.call(
      RPC_IDS.RENAME_NOTEBOOK,
      params,
      { path: `/notebook/${notebookId}` }
    );
    return result !== null;
  }

  async getSummary(notebookId: string): Promise<NotebookSummary> {
    const result = await this.transport.call(
      RPC_IDS.GET_SUMMARY,
      [notebookId, [2]],
      { path: `/notebook/${notebookId}` }
    );
    return decodeNotebookSummary(result);
  }

  async configureChat(notebookId: string, config: ChatConfig): Promise<boolean> {
    const goalCode = this.getChatGoalCode(config.goal);
    const lengthCode = this.getResponseLengthCode(config.responseLength);

    const goalSetting = config.goal === "custom" && config.customPrompt
      ? [goalCode, config.customPrompt]
      : [goalCode];

    const chatSettings = [goalSetting, [lengthCode]];
    const params = [notebookId, [[null, null, null, null, null, null, null, chatSettings]]];

    const result = await this.transport.call(
      RPC_IDS.RENAME_NOTEBOOK,
      params,
      { path: `/notebook/${notebookId}` }
    );
    return result !== null;
  }

  private getChatGoalCode(goal: ChatConfig["goal"]): number {
    const codes: Record<string, number> = {
      default: CONSTANTS.CHAT_GOAL_DEFAULT,
      learning_guide: CONSTANTS.CHAT_GOAL_LEARNING_GUIDE,
      custom: CONSTANTS.CHAT_GOAL_CUSTOM,
    };
    return codes[goal] || CONSTANTS.CHAT_GOAL_DEFAULT;
  }

  private getResponseLengthCode(length: ChatConfig["responseLength"]): number {
    const codes: Record<string, number> = {
      default: CONSTANTS.CHAT_RESPONSE_DEFAULT,
      longer: CONSTANTS.CHAT_RESPONSE_LONGER,
      shorter: CONSTANTS.CHAT_RESPONSE_SHORTER,
    };
    return codes[length] || CONSTANTS.CHAT_RESPONSE_DEFAULT;
  }
}
