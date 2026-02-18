/**
 * Typed message definitions for content-script/service-worker communication.
 *
 * All messages pass through browser.runtime.sendMessage and are dispatched
 * by the service worker's onMessage handler based on `type`.
 */

import type {
  AuthMethod,
  Finding,
  PrInfo,
  ReviewProgress,
  FileReviewResult,
  ReviewSummary,
} from '@/shared/types';

/** Discriminated union of all extension messages. */
export type Message =
  | { type: 'CHECK_AUTH'; payload: { orgUrl: string } }
  | { type: 'AUTH_RESULT'; payload: { authenticated: boolean; method: AuthMethod } }
  | { type: 'SAVE_PAT'; payload: { pat: string; orgUrl?: string } }
  | { type: 'PAT_RESULT'; payload: { success: boolean; error?: string } }
  | { type: 'POST_REVIEW_COMMENTS'; payload: { prInfo: PrInfo; fileResults: FileReviewResult[]; iterationId: number; prTitle: string } }
  | { type: 'POST_REVIEW_RESULT'; payload: { success: boolean; error?: string } }
  | { type: 'POST_SINGLE_COMMENT'; payload: { prInfo: PrInfo; filePath: string; finding: Finding; iterationId: number } }
  | { type: 'POST_SINGLE_RESULT'; payload: { success: boolean; error?: string } };

/** All valid message type strings. */
export type MessageType = Message['type'];

/** Extract the payload type for a given message type. */
export type MessagePayload<T extends MessageType> = Extract<
  Message,
  { type: T }
>['payload'];

/**
 * Send a typed message to the service worker.
 *
 * Wraps browser.runtime.sendMessage with type safety for message types
 * and their corresponding payloads.
 *
 * @param type - The message type identifier
 * @param payload - The typed payload for this message type
 * @returns The response from the message handler
 */
export function sendMessage<T extends MessageType>(
  type: T,
  payload: MessagePayload<T>,
): Promise<unknown> {
  return browser.runtime.sendMessage({ type, payload });
}

/** Messages sent over the review port (browser.runtime.connect). */
export type PortMessage =
  | { type: 'START_REVIEW'; payload: { prInfo: PrInfo } }
  | { type: 'REVIEW_PROGRESS'; payload: ReviewProgress }
  | { type: 'REVIEW_FILE_COMPLETE'; payload: FileReviewResult }
  | { type: 'REVIEW_COMPLETE'; payload: ReviewSummary }
  | { type: 'REVIEW_ERROR'; payload: { message: string } };
